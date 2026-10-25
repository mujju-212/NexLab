"""End-to-end regression coverage for platform course/exercise administration."""
import time
import uuid

import pytest
from flask_jwt_extended import create_access_token

from app import create_app
from app.extensions import db
from app.models.user import User


@pytest.fixture(scope="module")
def admin_client():
    app = create_app("testing")
    app.config["JWT_SECRET_KEY"] = "platform-content-admin-test-key-at-least-32-bytes"
    app.config["TESTING"] = True
    with app.app_context():
        db.create_all()
        user = User(
            id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@example.invalid",
            password_hash="test-only", full_name="Temporary Platform Admin",
            role="platform_admin", institution_id=None,
        )
        db.session.add(user)
        db.session.commit()
        token = create_access_token(
            identity=user.id,
            additional_claims={
                "role": "platform_admin", "institution_id": None,
                "must_change_password": False, "iat_f": time.time(),
            },
        )
    client = app.test_client()
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    yield client
    with app.app_context():
        db.session.remove()
        db.drop_all()


def _new_course(client):
    slug = f"qa-{uuid.uuid4().hex[:12]}"
    response = client.post("/api/admin/content/courses", json={"title": "QA Course", "slug": slug})
    assert response.status_code == 201, response.get_json()
    return response.get_json()["course"]["id"]


def _mcq_payload(title="QA MCQ"):
    return {
        "title": title, "exercise_type": "mcq", "description": "Choose the correct option.",
        "mcq_options": ["First", "Second", "Third"], "mcq_answer": "C",
        "is_published": True,
    }


def test_course_and_exercise_publish_happy_path_and_live_counts(admin_client):
    course_id = _new_course(admin_client)
    response = admin_client.patch(f"/api/admin/content/courses/{course_id}", json={"is_published": True})
    assert response.status_code == 400

    response = admin_client.post(
        f"/api/admin/content/courses/{course_id}/exercises",
        json={"title": "Draft coding exercise", "exercise_type": "coding"},
    )
    assert response.status_code == 201
    exercise_id = response.get_json()["exercise"]["id"]
    assert response.get_json()["exercise"]["is_published"] is False

    response = admin_client.patch(
        f"/api/admin/content/exercises/{exercise_id}", json={"is_published": True}
    )
    assert response.status_code == 400
    response = admin_client.patch(
        f"/api/admin/content/exercises/{exercise_id}",
        json={
            "description": "Echo the input.",
            "allowed_languages": ["python"],
            "test_cases": [{"input": "hello", "expected": "hello", "hidden": False}],
            "is_published": True,
        },
    )
    assert response.status_code == 200, response.get_json()

    response = admin_client.patch(f"/api/admin/content/courses/{course_id}", json={"is_published": True})
    assert response.status_code == 200, response.get_json()
    assert response.get_json()["course"]["exercise_count"] == 1
    listing = admin_client.get("/api/admin/content/courses").get_json()["courses"]
    row = next(course for course in listing if course["id"] == course_id)
    assert row["exercise_count"] == 1


def test_last_published_exercise_is_protected_and_mcq_answer_keeps_option_index(admin_client):
    course_id = _new_course(admin_client)
    first = admin_client.post(
        f"/api/admin/content/courses/{course_id}/exercises", json=_mcq_payload("First MCQ")
    )
    assert first.status_code == 201, first.get_json()
    first_id = first.get_json()["exercise"]["id"]
    assert first.get_json()["exercise"]["mcq_answer"] == "C"
    assert admin_client.patch(f"/api/admin/content/courses/{course_id}", json={"is_published": True}).status_code == 200

    assert admin_client.patch(
        f"/api/admin/content/exercises/{first_id}", json={"is_published": False}
    ).status_code == 409
    assert admin_client.delete(f"/api/admin/content/exercises/{first_id}").status_code == 409

    second = admin_client.post(
        f"/api/admin/content/courses/{course_id}/exercises", json=_mcq_payload("Second MCQ")
    )
    assert second.status_code == 201, second.get_json()
    assert admin_client.patch(
        f"/api/admin/content/exercises/{first_id}", json={"is_published": False}
    ).status_code == 200
    assert admin_client.delete(f"/api/admin/content/exercises/{first_id}").status_code == 200


def test_lesson_studio_blocks_persist_render_and_import_bundled_html(admin_client):
    course_id = _new_course(admin_client)
    untitled = admin_client.post(
        f"/api/admin/content/courses/{course_id}/exercises",
        json={
            "title": "Untitled lesson block",
            "exercise_type": "simulation",
            "content_blocks": [{"module_type": "html", "title": " ", "content_data": {"html": "<html></html>"}}],
            "is_published": True,
        },
    )
    assert untitled.status_code == 400
    assert "title" in untitled.get_json()["error"].lower()

    blocks = [
        {"id": "notes-1", "module_type": "markdown", "title": "Concept", "content_data": {"md": "## Loops\n\nRepeat a task."}},
        {"id": "html-1", "module_type": "html", "title": "Interactive Lab", "content_data": {"html": "<!doctype html><html><body><button>Try</button></body></html>"}},
        {"id": "code-1", "module_type": "code", "title": "Example", "content_data": {"language": "python", "code": "for i in range(3):\n    print(i)"}},
    ]
    created = admin_client.post(
        f"/api/admin/content/courses/{course_id}/exercises",
        json={"title": "Inline HTML Lab", "exercise_type": "simulation", "content_blocks": blocks, "is_published": True},
    )
    assert created.status_code == 201, created.get_json()
    exercise_id = created.get_json()["exercise"]["id"]
    assert created.get_json()["exercise"]["content_blocks"] == blocks
    assert admin_client.patch(f"/api/admin/content/courses/{course_id}", json={"is_published": True}).status_code == 200

    learner_course = admin_client.get(f"/api/platform-user/courses/{course_id}").get_json()
    learner_outline = next(item for item in learner_course["exercises"] if item["id"] == exercise_id)
    assert "content_blocks" not in learner_outline
    learner_exercise = admin_client.get(f"/api/platform-user/exercises/{exercise_id}").get_json()["exercise"]
    assert learner_exercise["content_blocks"] == blocks
    assert admin_client.patch(f"/api/admin/content/courses/{course_id}", json={"is_published": False}).status_code == 200
    assert admin_client.get(f"/api/platform-user/exercises/{exercise_id}").status_code == 404

    assets = admin_client.get("/api/admin/content/simulation-assets").get_json()["assets"]
    loops = next(item for item in assets if item["path"] == "/simulations/python-programming-lab/loops.html")
    source = admin_client.get("/api/admin/content/simulation-assets/source", query_string={"path": loops["path"]})
    assert source.status_code == 200
    assert "<!DOCTYPE html>" in source.get_json()["html"]
    assert admin_client.get("/api/admin/content/simulation-assets/source", query_string={"path": "/simulations/../../backend/run.py"}).status_code == 400

    invalid = admin_client.patch(
        f"/api/admin/content/exercises/{exercise_id}",
        json={"content_blocks": [{"id": "empty", "module_type": "html", "title": "Empty", "content_data": {"html": ""}}]},
    )
    assert invalid.status_code == 400


def test_problem_bank_admin_create_and_test_case_edit(admin_client):
    slug = f"qa-problem-{uuid.uuid4().hex[:10]}"
    payload = {
        "title": "Temporary QA problem",
        "slug": slug,
        "difficulty": "medium",
        "nexlab_topic": "QA",
        "description": "Read a value and return it unchanged.",
        "topics": ["strings", "testing"],
        "test_cases": [
            {"input_data": "hello", "expected": "hello", "is_sample": True},
            {"input_data": "hidden", "expected": "hidden", "is_sample": False},
        ],
    }
    created = admin_client.post("/api/admin/content/problems", json=payload)
    assert created.status_code == 201, created.get_json()
    problem_id = created.get_json()["problem"]["id"]
    assert len(created.get_json()["problem"]["test_cases"]) == 2
    assert created.get_json()["problem"]["is_active"] is False

    details = admin_client.get(f"/api/admin/content/problems/{problem_id}")
    assert details.status_code == 200
    assert details.get_json()["problem"]["description"] == payload["description"]

    edited = admin_client.patch(
        f"/api/admin/content/problems/{problem_id}",
        json={
            "title": "Temporary QA problem edited",
            "test_cases": [
                {"input": "updated", "expected": "updated", "sample": True},
                {"input": "secret", "expected": "secret", "sample": False},
                {"input": "edge", "expected": "edge", "sample": False},
            ],
            "is_active": True,
        },
    )
    assert edited.status_code == 200, edited.get_json()
    assert edited.get_json()["problem"]["title"] == "Temporary QA problem edited"
    assert len(edited.get_json()["problem"]["test_cases"]) == 3
    assert edited.get_json()["problem"]["test_cases"][0]["is_sample"] is True
    assert admin_client.post("/api/admin/content/problems", json={**payload, "slug": f"{slug}-empty", "test_cases": [], "is_active": True}).status_code == 400


def test_update_field_validation_null_clearing_and_legacy_publish_guard(admin_client):
    course_id = _new_course(admin_client)
    created = admin_client.post(
        f"/api/admin/content/courses/{course_id}/exercises",
        json={"title": "Simulation draft", "exercise_type": "simulation", "simulation_path": "/simulations/python-programming-lab/loops.html"},
    )
    assert created.status_code == 201, created.get_json()
    exercise_id = created.get_json()["exercise"]["id"]
    assert admin_client.patch(
        f"/api/admin/content/exercises/{exercise_id}", json={"simulation_path": None}
    ).status_code == 200
    updated = admin_client.get(f"/api/admin/content/courses/{course_id}/exercises").get_json()["exercises"]
    assert next(ex for ex in updated if ex["id"] == exercise_id)["simulation_path"] is None
    assert admin_client.patch(
        f"/api/admin/content/exercises/{exercise_id}", json={"test_cases": "not-an-array"}
    ).status_code == 400
    assert admin_client.post(
        f"/api/platform-user/admin/courses/{course_id}/publish", json={"published": True}
    ).status_code == 400
    assert admin_client.post(
        "/api/platform-user/admin/courses",
        json={"title": "Should stay draft", "slug": f"bad-{uuid.uuid4().hex[:10]}", "is_published": True},
    ).status_code == 400
    legacy_course = admin_client.post(
        "/api/platform-user/admin/courses",
        json={"title": "Legacy QA Course", "slug": f"legacy-{uuid.uuid4().hex[:10]}"},
    )
    assert legacy_course.status_code == 201, legacy_course.get_json()
    legacy_course_id = legacy_course.get_json()["course"]["id"]
    malformed = admin_client.post(
        f"/api/platform-user/admin/courses/{legacy_course_id}/exercises",
        json={"title": "Bad Exercise", "test_cases": "not-an-array"},
    )
    assert malformed.status_code == 400
    legacy_draft = admin_client.post(
        f"/api/platform-user/admin/courses/{legacy_course_id}/exercises",
        json={"title": "Legacy Draft Exercise"},
    )
    assert legacy_draft.status_code == 201, legacy_draft.get_json()
    assert legacy_draft.get_json()["exercise"]["is_published"] is False
