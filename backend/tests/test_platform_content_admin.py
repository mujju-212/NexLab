"""End-to-end regression coverage for platform course/exercise administration."""
import time
import uuid

import pytest
from flask_jwt_extended import create_access_token

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.institution import Institution, PlatformConfig
from app.models.academic import AuditLog
from app.models.subject import EnvironmentProfile
from app.models.feedback import Notification
from app.models.platform_admin import PlatformUserChangeRequest
from app.exec_engine.availability import execution_is_enabled


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


def test_onboarding_cannot_be_completed_with_missing_checklist_items(admin_client):
    app = admin_client.application
    with app.app_context():
        institution = Institution(
            id=str(uuid.uuid4()), name="Temporary onboarding QA", code=f"QA{uuid.uuid4().hex[:6]}",
            onboarding_status="pending",
        )
        db.session.add(institution)
        db.session.commit()
        institution_id = institution.id

    checklist_response = admin_client.get(f"/api/platform/institutions/{institution_id}/onboarding")
    assert checklist_response.status_code == 200
    checklist = checklist_response.get_json()["checklist"]
    assert checklist["institution_created"] is True
    assert checklist["admin_account_exists"] is False
    assert checklist_response.get_json()["complete"] is False

    blocked = admin_client.post(f"/api/platform/institutions/{institution_id}/onboarding/complete")
    assert blocked.status_code == 409
    assert "admin_account_exists" in blocked.get_json()["incomplete"]
    with app.app_context():
        assert db.session.get(Institution, institution_id).onboarding_status == "pending"


def test_platform_settings_are_validated_persistent_and_audited(admin_client):
    app = admin_client.application
    before = admin_client.get("/api/platform/config").get_json()["config"]["groq_daily_limit"]
    assert admin_client.patch("/api/platform/config", json={"unknown_flag": "true"}).status_code == 400
    assert admin_client.patch("/api/platform/config", json={"groq_daily_limit": "-1"}).status_code == 400
    after = admin_client.get("/api/platform/config").get_json()["config"]["groq_daily_limit"]
    assert after == before

    assert admin_client.patch(
        "/api/platform/config/features/allow_self_registration", json={"enabled": "false"}
    ).status_code == 400
    assert admin_client.patch(
        "/api/platform/config/features/allow_self_registration", json={"enabled": False}
    ).status_code == 200

    with app.app_context():
        PlatformConfig.seed_defaults()
        assert PlatformConfig.get("allow_self_registration") == "false"
        app.config["DOCKER_RUNNER_ENABLED"] = True
        PlatformConfig.set("code_execution_enabled", "true")
        assert execution_is_enabled() is True
        PlatformConfig.set("code_execution_enabled", "false")
        assert execution_is_enabled() is False
        app.config["DOCKER_RUNNER_ENABLED"] = False

    enabled = admin_client.post(
        "/api/platform/config/maintenance", json={"enabled": True, "message": "Maintenance test"}
    )
    assert enabled.status_code == 200
    assert admin_client.get("/api/platform/config/maintenance/status").get_json() == {
        "enabled": True, "message": "Maintenance test",
    }
    assert admin_client.post("/api/platform/config/maintenance", json={"enabled": False}).status_code == 200
    with app.app_context():
        assert AuditLog.query.filter_by(action="admin.platform.maintenance").count() == 2
        assert AuditLog.query.filter_by(action="admin.platform.feature_toggle").count() >= 1


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


def test_environment_approval_is_audited_truthful_and_role_protected(admin_client):
    with admin_client.application.app_context():
        profile = EnvironmentProfile(
            id=str(uuid.uuid4()),
            institution_id=None,
            name=f"test-env-{uuid.uuid4().hex[:8]}",
            display_name="Temporary environment request",
            docker_image="example.invalid/nexlab/test:temporary",
            is_platform_default=False,
            pip_packages=["numpy==1.26.4"],
            apt_packages=[],
            build_status="pending",
        )
        db.session.add(profile)
        db.session.commit()
        profile_id = profile.id

    denied = admin_client.application.test_client()
    with admin_client.application.app_context():
        admin_user = User.query.filter_by(role="platform_admin").first()
        token = create_access_token(
            identity=admin_user.id,
            additional_claims={
                "role": "institution_admin", "institution_id": str(uuid.uuid4()),
                "must_change_password": False, "iat_f": time.time(),
            },
        )
    denied.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    assert denied.post(f"/api/admin/environments/{profile_id}/approve").status_code == 403

    response = admin_client.post(f"/api/admin/environments/{profile_id}/approve")
    assert response.status_code == 200, response.get_json()
    result = response.get_json()
    assert "no image build was initiated" in result["message"]
    assert result["profile"]["build_status"] == "approved"
    assert result["profile"]["approved_by"]
    assert admin_client.post(f"/api/admin/environments/{profile_id}/approve").status_code == 409

    with admin_client.application.app_context():
        entry = AuditLog.query.filter_by(
            action="approve_environment_profile", target_id=profile_id
        ).first()
        assert entry is not None
        assert "no image build was initiated" in entry.detail


def test_institution_billing_persists_validates_audits_and_honors_zero(admin_client):
    with admin_client.application.app_context():
        institution = Institution(
            id=str(uuid.uuid4()), name="Temporary billing QA", code=f"TQA{uuid.uuid4().hex[:6]}",
            plan="free", billing_email="billing@example.invalid", billing_notes="old note",
        )
        db.session.add(institution)
        db.session.commit()
        institution_id = institution.id

    first = admin_client.get(f"/api/platform/institutions/{institution_id}/billing")
    assert first.status_code == 200
    assert first.get_json()["student_limit"] == 100

    invalid = admin_client.patch(
        f"/api/platform/institutions/{institution_id}/billing/plan",
        json={"plan": "pro", "billing_email": "not-an-email", "billing_notes": "should not persist"},
    )
    assert invalid.status_code == 400

    updated = admin_client.patch(
        f"/api/platform/institutions/{institution_id}/billing/plan",
        json={"plan": "pro", "billing_email": "ops@example.invalid", "billing_notes": ""},
    )
    assert updated.status_code == 200, updated.get_json()
    assert admin_client.get(f"/api/platform/institutions/{institution_id}/billing").get_json()["billing_email"] == "ops@example.invalid"
    cleared = admin_client.patch(
        f"/api/platform/institutions/{institution_id}/billing/plan",
        json={"plan": "pro", "billing_email": "", "billing_notes": ""},
    )
    assert cleared.status_code == 200, cleared.get_json()
    zero = admin_client.patch(
        f"/api/platform/institutions/{institution_id}/billing/groq-limit", json={"limit": 0}
    )
    assert zero.status_code == 200, zero.get_json()
    assert admin_client.patch(
        f"/api/platform/institutions/{institution_id}/billing/groq-limit", json={"limit": True}
    ).status_code == 400

    current = admin_client.get(f"/api/platform/institutions/{institution_id}/billing").get_json()
    assert current["plan"] == "pro"
    assert current["billing_email"] is None
    assert current["billing_notes"] == ""
    assert current["student_limit"] == 500
    assert current["groq_limit"] == 0
    assert current["groq_limit_source"] == "override"

    with admin_client.application.app_context():
        actions = AuditLog.query.filter(
            AuditLog.target_id == institution_id,
            AuditLog.action.in_(["admin.billing.plan_update", "admin.billing.groq_limit"]),
        ).all()
        assert {item.action for item in actions} == {"admin.billing.plan_update", "admin.billing.groq_limit"}


def test_institution_profile_update_validates_atomically_and_audits(admin_client):
    with admin_client.application.app_context():
        institution = Institution(
            id=str(uuid.uuid4()), name="Temporary profile QA", code=f"PQA{uuid.uuid4().hex[:6]}",
            contact_email="admin@example.invalid", email_domain="example.invalid",
        )
        db.session.add(institution)
        db.session.commit()
        institution_id = institution.id

    invalid = admin_client.patch(
        f"/api/admin/institutions/{institution_id}",
        json={"name": "Must not partially save", "email_domain": "https://bad-domain"},
    )
    assert invalid.status_code == 400
    with admin_client.application.app_context():
        unchanged = db.session.get(Institution, institution_id)
        assert unchanged.name == "Temporary profile QA"

    updated = admin_client.patch(
        f"/api/admin/institutions/{institution_id}",
        json={
            "name": "Renamed profile QA", "contact_email": "ops@example.edu",
            "email_domain": "EXAMPLE.EDU", "address": "10 Test Road", "website": "https://example.edu",
        },
    )
    assert updated.status_code == 200, updated.get_json()
    current = updated.get_json()["institution"]
    assert current["name"] == "Renamed profile QA"
    assert current["contact_email"] == "ops@example.edu"
    assert current["email_domain"] == "example.edu"
    assert current["address"] == "10 Test Road"
    assert admin_client.patch(f"/api/admin/institutions/{institution_id}", json={"plan": "enterprise"}).status_code == 400

    with admin_client.application.app_context():
        log = AuditLog.query.filter_by(
            action="admin.institution.profile_update", target_id=institution_id
        ).first()
        assert log is not None


def test_platform_announcement_requires_recipient_confirmation_and_writes_history(admin_client):
    with admin_client.application.app_context():
        institution = Institution(
            id=str(uuid.uuid4()), name="Temporary announcement QA", code=f"AQA{uuid.uuid4().hex[:6]}",
        )
        db.session.add(institution)
        db.session.flush()
        recipient = User(
            id=str(uuid.uuid4()), email=f"notice-{uuid.uuid4().hex[:8]}@example.invalid",
            password_hash="test-only", full_name="Temporary Institution Admin",
            role="institution_admin", institution_id=institution.id, is_active=True,
        )
        db.session.add(recipient)
        db.session.commit()
        recipient_id = recipient.id

    preview = admin_client.get("/api/admin/announcements/preview")
    assert preview.status_code == 200
    count = preview.get_json()["recipient_count"]
    assert count >= 1
    mismatch = admin_client.post("/api/admin/announcements", json={
        "title": "Platform QA notice", "message": "This should not send yet.",
        "expected_recipients": count - 1,
    })
    assert mismatch.status_code == 409
    assert mismatch.get_json()["recipient_count"] == count
    assert admin_client.post("/api/admin/announcements", json={
        "title": "Bad title", "message": "message", "expected_recipients": True,
    }).status_code == 400

    sent = admin_client.post("/api/admin/announcements", json={
        "title": "Platform QA notice", "message": "A temporary test notice.",
        "expected_recipients": count,
    })
    assert sent.status_code == 201, sent.get_json()
    assert sent.get_json()["sent_to"] == count
    history = admin_client.get("/api/admin/announcements").get_json()["announcements"]
    assert any(row["title"] == "Platform QA notice" and row["sent_to"] == count for row in history)
    with admin_client.application.app_context():
        assert Notification.query.filter_by(user_id=recipient_id, title="Platform QA notice").count() == 1
        log = AuditLog.query.filter_by(action="admin.platform.announcement").first()
        assert log is not None


def test_user_role_and_tenant_change_requires_distinct_platform_admins(admin_client):
    with admin_client.application.app_context():
        source = Institution(id=str(uuid.uuid4()), name="Source QA", code=f"SQA{uuid.uuid4().hex[:6]}")
        destination = Institution(id=str(uuid.uuid4()), name="Destination QA", code=f"DQA{uuid.uuid4().hex[:6]}")
        db.session.add_all([source, destination])
        db.session.flush()
        target = User(
            id=str(uuid.uuid4()), email=f"move-{uuid.uuid4().hex[:8]}@example.invalid",
            password_hash="test-only", full_name="Temporary Move Target", role="student",
            institution_id=source.id, is_active=True,
        )
        reviewer = User(
            id=str(uuid.uuid4()), email=f"reviewer-{uuid.uuid4().hex[:8]}@example.invalid",
            password_hash="test-only", full_name="Independent Reviewer", role="platform_admin",
            institution_id=None,
        )
        db.session.add_all([target, reviewer])
        db.session.commit()
        reject_target = User(
            id=str(uuid.uuid4()), email=f"reject-{uuid.uuid4().hex[:8]}@example.invalid",
            password_hash="test-only", full_name="Temporary Reject Target", role="student",
            institution_id=source.id, is_active=True,
        )
        db.session.add(reject_target)
        db.session.commit()
        target_id, reject_target_id = target.id, reject_target.id
        source_id, destination_id, reviewer_id = source.id, destination.id, reviewer.id

    created = admin_client.post("/api/admin/user-change-requests", json={
        "user_id": target_id, "to_role": "instructor", "to_institution_id": destination_id,
        "reason": "Move the teaching account to the verified partner tenant.",
    })
    assert created.status_code == 201, created.get_json()
    request_id = created.get_json()["request"]["id"]
    assert admin_client.post(f"/api/admin/user-change-requests/{request_id}/approve", json={}).status_code == 403
    assert admin_client.post("/api/admin/user-change-requests", json={
        "user_id": target_id, "to_role": "platform_admin", "to_institution_id": destination_id,
        "reason": "Attempt to grant a platform role in a normal move.",
    }).status_code == 400
    assert admin_client.post("/api/admin/user-change-requests", json={
        "user_id": target_id, "to_role": "instructor", "to_institution_id": destination_id,
        "reason": "Duplicate pending request.",
    }).status_code == 409

    app = admin_client.application
    reviewer_client = app.test_client()
    with app.app_context():
        reviewer_token = create_access_token(
            identity=reviewer_id,
            additional_claims={"role": "platform_admin", "institution_id": None,
                              "must_change_password": False, "iat_f": time.time()},
        )
    reviewer_client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {reviewer_token}"
    approved = reviewer_client.post(f"/api/admin/user-change-requests/{request_id}/approve", json={"review_note": "Reviewed against the ticket."})
    assert approved.status_code == 200, approved.get_json()
    assert approved.get_json()["request"]["status"] == "approved"
    assert reviewer_client.post(f"/api/admin/user-change-requests/{request_id}/approve", json={}).status_code == 409

    rejected_request = admin_client.post("/api/admin/user-change-requests", json={
        "user_id": reject_target_id, "to_role": "instructor", "to_institution_id": destination_id,
        "reason": "Reject this test request to validate the negative decision path.",
    })
    assert rejected_request.status_code == 201, rejected_request.get_json()
    rejected_id = rejected_request.get_json()["request"]["id"]
    rejected = reviewer_client.post(f"/api/admin/user-change-requests/{rejected_id}/reject", json={"review_note": "Not approved for this test."})
    assert rejected.status_code == 200, rejected.get_json()
    assert rejected.get_json()["request"]["status"] == "rejected"

    with app.app_context():
        unchanged = db.session.get(User, reject_target_id)
        assert unchanged.role == "student"
        assert unchanged.institution_id == source_id
        assert AuditLog.query.filter_by(action="admin.user.change_request.reject", target_id=reject_target_id).count() == 1
        moved = db.session.get(User, target_id)
        assert moved.role == "instructor"
        assert moved.institution_id == destination_id
        assert moved.force_logout_at is not None
        assert AuditLog.query.filter_by(action="admin.user.change_request.create", target_id=target_id).count() == 1
        assert AuditLog.query.filter_by(action="admin.user.change_request.approve", target_id=target_id).count() == 1
        assert PlatformUserChangeRequest.query.filter_by(id=request_id, status="approved").count() == 1


def test_environment_request_flow_is_tenant_scoped_and_assignment_is_retired(admin_client):
    with admin_client.application.app_context():
        institution = Institution(
            id=str(uuid.uuid4()), name="Temporary environment tenant", code=f"ENV{uuid.uuid4().hex[:6]}",
        )
        db.session.add(institution)
        db.session.flush()
        tenant_admin = User(
            id=str(uuid.uuid4()), email=f"env-{uuid.uuid4().hex[:8]}@example.invalid",
            password_hash="test-only", full_name="Temporary Environment Admin",
            role="institution_admin", institution_id=institution.id, is_active=True,
        )
        db.session.add(tenant_admin)
        db.session.commit()
        tenant_id, tenant_admin_id = institution.id, tenant_admin.id

    tenant_client = admin_client.application.test_client()
    with admin_client.application.app_context():
        token = create_access_token(
            identity=tenant_admin_id,
            additional_claims={"role": "institution_admin", "institution_id": tenant_id,
                              "must_change_password": False, "iat_f": time.time()},
        )
    tenant_client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    request_response = tenant_client.post("/api/institution/environments", json={
        "name": "python-science", "display_name": "Python Science",
        "docker_image": "registry.example.invalid/labs/python-science:v2",
        "pip_packages": ["numpy==1.26.4", "pandas"], "apt_packages": ["libpq-dev"],
    })
    assert request_response.status_code == 201, request_response.get_json()
    profile_id = request_response.get_json()["profile"]["id"]
    assert "will not build or activate" in request_response.get_json()["message"]
    assert tenant_client.get("/api/institution/environments").get_json()["runtime_supported"] is False
    assert tenant_client.post("/api/institution/environments", json={
        "name": "python-science", "display_name": "Duplicate", "docker_image": "repo/image:tag",
    }).status_code == 409

    retired = tenant_client.post("/api/institution/subjects", json={"env_profile_id": profile_id})
    assert retired.status_code == 409, retired.get_json()

    approved = admin_client.post(f"/api/admin/environments/{profile_id}/approve")
    assert approved.status_code == 200, approved.get_json()
    assert approved.get_json()["profile"]["build_status"] == "approved"
    assert "no image build was initiated" in approved.get_json()["message"]
    assert tenant_client.get("/api/institution/environments").get_json()["runtime_supported"] is False
