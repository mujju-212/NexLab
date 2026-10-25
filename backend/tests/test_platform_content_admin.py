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
