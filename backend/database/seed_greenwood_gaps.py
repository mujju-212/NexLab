#!/usr/bin/env python3
"""
seed_greenwood_gaps.py — fill the thin/empty demo tables for the GREENWOOD
tenant so every role's pages have realistic data. Purely additive and
idempotent: every row uses a deterministic uuid5 id and is skipped if it
already exists.

WHAT IT FILLS (scoped to institution code 'GREENWOOD' only)
────────────────────────────────────────────────────────────────────────────
A. Announcements ......... 7 sent (staggered over the semester) + 1 scheduled
B. Exam attempts ......... both published Greenwood exams get a realistic
                           cohort of submitted attempts (answers JSON in the
                           app's shape, mixed tiers, score = earned/max%)
C. Hint logs ............. ~150 AI-hint rows across students × experiments
D. Interventions ......... +7 rows with action types and outcomes
E. Chat messages ......... instructor↔student exchanges in completed sessions
F. Notifications ......... ~90 across students / instructors / admin

Usage:  cd backend && ./venv/Scripts/python.exe database/seed_greenwood_gaps.py
"""
import os
import sys
import json
import uuid
import random
from datetime import datetime, timedelta, date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault(
    "TEST_DATABASE_URL",
    os.environ.get("DATABASE_URL",
                   "postgresql://postgres:vlabpass@localhost:5433/virtuallab"))

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402

RNG = random.Random(4242)
NS = uuid.UUID("5c7e1a90-3b2d-4f6a-8c1e-9d0b7a2e4f11")  # greenwood-gaps ns


def uid(name: str) -> str:
    return str(uuid.uuid5(NS, name))


def dt(d: date, h=10, m=0):
    return datetime(d.year, d.month, d.day, h, m)


TODAY = date(2026, 10, 28)

ANNOUNCEMENTS = [
    # (days_ago, title, message, priority, category, target, status)
    (28, "Welcome to the Fall Semester Labs",
     "All lab sections begin next week. Check your timetable for your first "
     "session and complete the pre-lab reading before you arrive.",
     "normal", "general", "all", "sent"),
    (24, "Lab Timetable Released",
     "The weekly lab timetable is now live under Sessions. Section A meets "
     "Wednesdays 10:00, Section B Thursdays 10:00.",
     "normal", "schedule", "students", "sent"),
    (19, "Mid-Term Assessment Announced",
     "The Data Structures mid-term opens Sep 6 and closes Sep 14. It covers "
     "lists, stacks, trees and graph basics. One attempt — read carefully.",
     "important", "exam", "students", "sent"),
    (15, "Plagiarism Policy Reminder",
     "All submissions pass a similarity scan. Discussing ideas is fine; "
     "sharing code is not. First offences lose the lab grade.",
     "important", "general", "students", "sent"),
    (11, "Instructor Office Hours",
     "Dr. Instructor holds office hours Tue/Thu 14:00-16:00 in CS-204. "
     "No appointment needed for lab-related questions.",
     "normal", "event", "all", "sent"),
    (7, "Viva Week Schedule",
     "Viva evaluations run this week during your regular lab slot. Bring your "
     "notebook; questions cover linked lists and BST operations.",
     "important", "exam", "students", "sent"),
    (3, "Lab Maintenance Window",
     "The code-execution sandbox restarts Saturday 22:00-23:00. Any run in "
     "that window may fail — resubmit afterwards.",
     "urgent", "cancellation", "all", "sent"),
    (2, "Guest Lecture: Graph Algorithms in Production",
     "Industry guest on routing engines, Friday 11:00 in the auditorium. "
     "Attendance counts toward engagement.",
     "normal", "event", "all", "scheduled"),
]

HINT_PROMPTS = [
    ("Why does my loop skip the last element?", "Check your range bound — "
     "Python ranges exclude the stop value, so use len(list) not len(list)-1."),
    ("My stack pop returns None", "Guard the empty case first: if not stack: "
     "return None. Then pop from the end with list.pop()."),
    ("How do I merge two sorted lists?", "Keep two pointers, always advance "
     "the pointer with the smaller value, then append the remainder."),
    ("Recursion depth exceeded on BST insert", "Your recursion never reaches "
     "the base case — verify the None-child check comes before the compare."),
    ("Output order is reversed", "You are prepending; collect into the result "
     "with append and iterate left to right."),
    ("What does 'NoneType is not iterable' mean?", "A function returned None "
     "where a list was expected — usually a missing return on one branch."),
]

INTERVENTIONS = [
    ("nudge", "Sent an automated attendance nudge — missed 3 consecutive labs.",
     "improved"),
    ("extension", "Granted a 3-day deadline extension on Lab 3 (medical note).",
     "resolved"),
    ("counseling", "Referred to the academic counselling cell after two low "
     "viva scores.", "open"),
    ("nudge", "Practice-track recommendation sent: arrays fundamentals set.",
     "improved"),
    ("parent_call", "Called guardian about repeated absent lab sessions.",
     "open"),
    ("extension", "Quiz retry unlocked after network outage during attempt.",
     "resolved"),
    ("mentoring", "Paired with a peer mentor from the top band.", "open"),
]

CHAT_EXCHANGES = [
    ("student", "Sir, my linked list traversal prints only the first node."),
    ("instructor", "Check your next pointer update — are you reassigning "
     "current, or moving the head?"),
    ("student", "I was moving head. Fixed, all nodes print now!"),
    ("instructor", "Good. Now handle the empty-list case before the loop."),
    ("student", "Is the mid-term cumulative or only post-midterm topics?"),
    ("instructor", "Everything through week 6 — lists, stacks, queues, trees."),
    ("student", "My BST insert fails on duplicate keys."),
    ("instructor", "Decide your policy: ignore duplicates or count them on "
     "the right. Either is fine if consistent."),
    ("student", "The sandbox is timing out for my sorting code."),
    ("instructor", "Your nested loop is O(n^3) — the inner swap loop can be "
     "dropped entirely."),
    ("student", "Thanks sir, passes all test cases now."),
    ("instructor", "Nice work — now optimise memory and resubmit once."),
]

NOTIF_TEMPLATES_STUDENT = [
    ("announcement", "New announcement from your instructor"),
    ("session_started", "Your live lab session is starting"),
    ("grade_posted", "A new grade was posted for your lab"),
    ("intervention", "Your instructor left you a note"),
]
NOTIF_TEMPLATES_STAFF = [
    ("submission", "A student submitted Lab work for review"),
    ("session_summary", "Session attendance summary is ready"),
    ("intervention_outcome", "An intervention outcome was updated"),
]


def main():
    app = create_app()
    with app.app_context():
        sess = db.session
        inst = sess.execute(text(
            "SELECT id FROM institutions WHERE code='GREENWOOD'")).scalar()
        assert inst, "GREENWOOD institution not found"
        print(f"Tenant: {inst}")

        admin = sess.execute(text(
            "SELECT id FROM users WHERE role='institution_admin' "
            "AND institution_id=:i LIMIT 1"), {"i": inst}).scalar()
        instructor = sess.execute(text(
            "SELECT id FROM users WHERE email='instructor@nexlab.demo'")).scalar()
        print(f"admin={admin} instructor={instructor}")

        # ── A. Announcements ──────────────────────────────────────────────
        made = 0
        for days_ago, title, message, priority, category, target, status in ANNOUNCEMENTS:
            aid = uid(f"ann:{title}")
            if sess.execute(text("SELECT 1 FROM announcements WHERE id=:i"),
                            {"i": aid}).first():
                continue
            created = dt(TODAY - timedelta(days=days_ago), 9, 15)
            sent_at = created if status == "sent" else None
            send_at = dt(TODAY + timedelta(days=3), 9, 0) if status == "scheduled" else None
            reach = 245 if target in ("all", "students") else 58
            views = int(reach * RNG.uniform(0.35, 0.8)) if status == "sent" else 0
            sess.execute(text(
                "INSERT INTO announcements (id, institution_id, author_id, author_role,"
                " title, message, priority, category, target, status, send_at, sent_at,"
                " created_at, updated_at, reach_count, views_count, likes_count)"
                " VALUES (:id, :inst, :author, 'institution_admin', :title, :message,"
                " :priority, :category, :target, :status, :send_at, :sent_at,"
                " :created, :created, :reach, :views, :likes)"),
                {"id": aid, "inst": inst, "author": admin, "title": title,
                 "message": message, "priority": priority, "category": category,
                 "target": target, "status": status, "send_at": send_at,
                 "sent_at": sent_at, "created": created, "reach": reach,
                 "views": views, "likes": RNG.randint(3, 40) if status == "sent" else 0})
            made += 1
        sess.commit()
        print(f"[A] announcements created: {made}")

        # ── B. Exam attempts ──────────────────────────────────────────────
        exams = sess.execute(text(
            "SELECT id, title, max_attempts, pass_threshold, exam_type,"
            " available_from, due_at FROM exams"
            " WHERE institution_id=:i AND is_published=true"), {"i": inst}).mappings().all()
        made = 0
        for x in exams:
            xid, max_att = x["id"], x["max_attempts"] or 1
            questions = sess.execute(text(
                "SELECT id, question_type, correct_answer, points, options"
                " FROM exam_questions WHERE exam_id=:e ORDER BY display_order"),
                {"e": xid}).mappings().all()
            if not questions:
                continue
            max_points = sum(float(q["points"] or 0) for q in questions)
            mcqs = [q for q in questions if q["question_type"] == "mcq"]
            codings = [q for q in questions if q["question_type"] != "mcq"]
            cohort = sess.execute(text(
                "SELECT DISTINCT ss2.student_id FROM exams x2"
                " JOIN section_subjects ss ON ss.subject_id = x2.subject_id"
                " JOIN section_students ss2 ON ss2.section_id = ss.section_id"
                " WHERE x2.id = :e LIMIT 90"), {"e": xid}).scalars().all()
            participants = RNG.sample(cohort, int(len(cohort) * 0.75))
            for si, student in enumerate(participants):
                attempts = max_att if si % 9 == 0 else 1
                for att in range(1, attempts + 1):
                    key = f"attempt:{xid}:{student}:{att}"
                    aid = uid(key)
                    if sess.execute(text("SELECT 1 FROM exam_attempts WHERE id=:i"),
                                    {"i": aid}).first():
                        continue
                    start = x["available_from"] + timedelta(days=RNG.randint(0, 4),
                                                            hours=RNG.randint(8, 21))
                    answers, earned = {}, 0.0
                    for q in mcqs:
                        opts = q["options"] or []
                        if len(opts) < 2:
                            continue
                        correct_idx = opts.index(q["correct_answer"]) \
                            if q["correct_answer"] in opts else 0
                        tier = RNG.random()
                        if tier < 0.68:
                            idx_pick = correct_idx
                        elif tier < 0.86:
                            idx_pick = (correct_idx + 1) % len(opts)
                        else:
                            idx_pick = (correct_idx + 2) % len(opts)
                        ok = idx_pick == correct_idx
                        pts = float(q["points"] or 0)
                        earned += pts if ok else 0.0
                        answers[q["id"]] = {"answer": idx_pick, "correct": ok,
                                            "earned": pts if ok else 0.0,
                                            "points": pts}
                    for q in codings:
                        pts = float(q["points"] or 0)
                        frac = RNG.choice([1.0, 1.0, 0.6, 0.3, 0.0])
                        e_pts = round(pts * frac, 1)
                        earned += e_pts
                        answers[q["id"]] = {
                            "answer": "def solve():\n    # student solution",
                            "correct": frac == 1.0, "earned": e_pts, "points": pts}
                    score = round(earned / max_points * 100, 1) if max_points else 0.0
                    submitted = start + timedelta(minutes=RNG.randint(18, 55))
                    sess.execute(text(
                        "INSERT INTO exam_attempts (id, exam_id, student_id,"
                        " started_at, expires_at, submitted_at, score,"
                        " total_points, max_points, passed, status, answers,"
                        " created_at)"
                        " VALUES (:id, :e, :s, :start, :exp, :sub, :score,"
                        " :earned, :maxp, :passed, 'submitted',"
                        " CAST(:answers AS json), :start)"),
                         {"id": aid, "e": xid, "s": student, "start": start,
                         "exp": submitted + timedelta(minutes=10),
                         "sub": submitted, "score": score,
                         "earned": round(earned, 1), "maxp": max_points,
                         "passed": score >= float(x["pass_threshold"] or 40),
                         "answers": json.dumps(answers)})
                    made += 1
        sess.commit()
        print(f"[B] exam attempts created: {made}")

        # ── C. Hint logs ──────────────────────────────────────────────────
        students = sess.execute(text(
            "SELECT id FROM users WHERE role='student' AND institution_id=:i"
            " ORDER BY id LIMIT 60"), {"i": inst}).scalars().all()
        experiments = sess.execute(text(
            "SELECT id FROM experiments WHERE institution_id=:i"
            " AND is_published=true ORDER BY exp_number LIMIT 8"),
            {"i": inst}).scalars().all()
        models = ["llama-3.3-70b", "llama-3.1-8b-instant", "mixtral-8x7b"]
        made = 0
        for i in range(150):
            key = f"hint:{i}"
            hid = uid(key)
            if sess.execute(text("SELECT 1 FROM hint_logs WHERE id=:i"),
                            {"i": hid}).first():
                continue
            created = dt(TODAY - timedelta(days=RNG.randint(5, 55)),
                         RNG.randint(9, 20), RNG.randint(0, 59))
            prompt, response = HINT_PROMPTS[i % len(HINT_PROMPTS)]
            sess.execute(text(
                "INSERT INTO hint_logs (id, student_id, experiment_id,"
                " hint_level, prompt_sent, response_received, model_used,"
                " latency_ms, is_fallback, created_at)"
                " VALUES (:id, :s, :e, :lvl, :p, :r, :m, :lat, :fb, :c)"),
                {"id": hid, "s": RNG.choice(students),
                 "e": RNG.choice(experiments), "lvl": RNG.randint(1, 3),
                 "p": prompt, "r": response, "m": RNG.choice(models),
                 "lat": RNG.randint(280, 1900), "fb": RNG.random() < 0.08,
                 "c": created})
            made += 1
        sess.commit()
        print(f"[C] hint logs created: {made}")

        # ── D. Interventions ──────────────────────────────────────────────
        at_risk = sess.execute(text(
            "SELECT s.student_id, (s.metrics->'risk'->>'risk_score')::numeric AS risk"
            " FROM student_metric_snapshots s"
            " JOIN users u ON u.id = s.student_id"
            " WHERE s.institution_id=:i AND u.institution_id=:i"
            " ORDER BY (s.metrics->'risk'->>'risk_score')::numeric DESC NULLS LAST"
            " LIMIT 12"), {"i": inst}).all()
        made = 0
        for i, spec in enumerate(INTERVENTIONS):
            if not at_risk:
                break
            sid, risk = at_risk[i % len(at_risk)]
            iid = uid(f"interv:{i}:{sid}")
            if sess.execute(text("SELECT 1 FROM interventions WHERE id=:i"),
                            {"i": iid}).first():
                continue
            created = dt(TODAY - timedelta(days=20 - i * 2), 11, 30)
            outcome, resolved = INTERVENTIONS[i][2], None
            if outcome in ("improved", "resolved"):
                resolved = created + timedelta(days=RNG.randint(3, 10))
            sess.execute(text(
                "INSERT INTO interventions (id, institution_id, student_id,"
                " created_by, action_type, note, outcome, outcome_note,"
                " resolved_at, created_at, risk_score_before, risk_score_after)"
                " VALUES (:id, :inst, :s, :by, :at, :note, :oc, :ocn,"
                " :res, :c, :rb, :ra)"),
                {"id": iid, "inst": inst, "s": sid, "by": instructor,
                 "at": spec[0], "note": spec[1],
                 "oc": spec[2], "ocn": spec[2] if spec[2] != "open" else None,
                 "res": resolved, "c": created,
                 "rb": float(risk or 62), "ra": float(risk or 62) - RNG.randint(2, 14)})
            made += 1
        sess.commit()
        print(f"[D] interventions created: {made}")

        # ── E. Chat messages ──────────────────────────────────────────────
        sessions = sess.execute(text(
            "SELECT id, started_at FROM lab_sessions"
            " WHERE institution_id=:i AND status='completed'"
            " ORDER BY scheduled_at DESC LIMIT 4"), {"i": inst}).all()
        students_s = sess.execute(text(
            "SELECT id FROM users WHERE role='student' AND institution_id=:i"
            " ORDER BY id LIMIT 14"), {"i": inst}).scalars().all()
        made = 0
        for si, (lsid, started) in enumerate(sessions):
            for mi, (who, msg) in enumerate(CHAT_EXCHANGES):
                key = f"chat:{lsid}:{mi}"
                mid = uid(key)
                if sess.execute(text("SELECT 1 FROM chat_messages WHERE id=:i"),
                                {"i": mid}).first():
                    continue
                at = (started or dt(TODAY - timedelta(days=30))) + timedelta(minutes=8 + mi * 3)
                frm = instructor if who == "instructor" else students_s[(si + mi) % len(students_s)]
                to = None if who == "instructor" else instructor
                sess.execute(text(
                    "INSERT INTO chat_messages (id, session_id, from_id, to_id,"
                    " text, at) VALUES (:id, :s, :f, :t, :x, :at)"),
                    {"id": mid, "s": lsid, "f": frm, "t": to, "x": msg, "at": at})
                made += 1
        sess.commit()
        print(f"[E] chat messages created: {made}")

        # ── F. Notifications ──────────────────────────────────────────────
        made = 0
        for i in range(90):
            key = f"notif:{i}"
            nid = uid(key)
            if sess.execute(text("SELECT 1 FROM notifications WHERE id=:i"),
                            {"i": nid}).first():
                continue
            created = dt(TODAY - timedelta(days=RNG.randint(0, 40)),
                         RNG.randint(8, 20), RNG.randint(0, 59))
            if i % 9 == 0:
                user, tpls = instructor, NOTIF_TEMPLATES_STAFF
            elif i % 17 == 0:
                user, tpls = admin, NOTIF_TEMPLATES_STAFF
            else:
                user, tpls = RNG.choice(students), NOTIF_TEMPLATES_STUDENT
            ttype, title = tpls[i % len(tpls)]
            is_read = created < dt(TODAY - timedelta(days=6))
            sess.execute(text(
                "INSERT INTO notifications (id, user_id, type, title, message,"
                " is_read, created_at) VALUES (:id, :u, :t, :ti, :m, :r, :c)"),
                {"id": nid, "u": user, "t": ttype, "ti": title,
                 "m": f"{title} — {created.strftime('%d %b')}.",
                 "r": is_read, "c": created})
            made += 1
        sess.commit()
        print(f"[F] notifications created: {made}")

        # ── G. Concept mastery (derived from real grades × concept tags) ───
        # The student Knowledge Map reads concept_mastery; only 6 students had
        # rows. Derive mastery for EVERY student with grades: each experiment's
        # final grade (grade_scale-normalised %) contributes to that
        # experiment's concept tags. last_updated is stamped recent so the
        # knowledge map's period filter shows it.
        made = 0
        grade_rows = sess.execute(text(
            "SELECT g.student_id, g.experiment_id,"
            " (g.final_grade / NULLIF(e.grade_scale, 0) * 100.0) AS pct,"
            " e.concept_tags"
            " FROM grades g JOIN experiments e ON e.id = g.experiment_id"
            " JOIN users u ON u.id = g.student_id"
            " WHERE u.institution_id = :i AND g.final_grade IS NOT NULL"
            " AND e.concept_tags IS NOT NULL"), {"i": inst}).all()
        accum = {}
        for student, experiment, pct, tags in grade_rows:
            if pct is None or not tags:
                continue
            try:
                tag_list = tags if isinstance(tags, list) else json.loads(tags)
            except Exception:
                continue
            stamp = dt(TODAY - timedelta(days=RNG.randint(1, 20)), 15, 0)
            for tag in tag_list:
                concept = str(tag).strip().lower()
                if not concept:
                    continue
                key = (student, concept)
                acc = accum.setdefault(key, {"scores": [], "stamp": stamp})
                acc["scores"].append(float(pct))
                acc["stamp"] = max(acc["stamp"], stamp)
        for (student, concept), acc in accum.items():
            key = f"cm:{student}:{concept}"
            cid = uid(key)
            avg = round(sum(acc["scores"]) / len(acc["scores"]), 2)
            existing = sess.execute(text(
                "SELECT experiment_count, last_updated FROM concept_mastery"
                " WHERE student_id=:s AND concept=:c"),
                {"s": student, "c": concept}).first()
            if existing:
                # Only refresh if our derivation is newer than what's stored.
                if existing[1] and existing[1] >= acc["stamp"]:
                    continue
                sess.execute(text(
                    "UPDATE concept_mastery SET mastery_score=:m,"
                    " experiment_count=:n, last_updated=:lu"
                    " WHERE student_id=:s AND concept=:c"),
                    {"m": avg, "n": len(acc["scores"]), "lu": acc["stamp"],
                     "s": student, "c": concept})
            else:
                sess.execute(text(
                    "INSERT INTO concept_mastery (student_id, institution_id,"
                    " concept, mastery_score, experiment_count, last_updated)"
                    " VALUES (:s, :i, :c, :m, :n, :lu)"),
                    {"s": student, "i": inst, "c": concept, "m": avg,
                     "n": len(acc["scores"]), "lu": acc["stamp"]})
            made += 1
        sess.commit()
        print(f"[G] concept mastery rows created/refreshed: {made}")

        # ── H. Weekly grade history (trend chart needs multi-week data) ────
        # The academic trend reads grades.created_at across a 12-week window.
        # Seed a realistic per-experiment grade history for students enrolled
        # in the DSA section-subject: one graded lab per week, tiered scores.
        made = 0
        dsa_ss = sess.execute(text(
            "SELECT ss.id FROM section_subjects ss"
            " JOIN institutions i ON i.id = ss.institution_id"
            " WHERE i.code='GREENWOOD'"
            " ORDER BY (SELECT count(*) FROM section_students s2 WHERE s2.section_id = ss.section_id) DESC"
            " LIMIT 1")).scalar()
        if dsa_ss:
            cohort = sess.execute(text(
                "SELECT student_id FROM section_students WHERE section_id ="
                " (SELECT section_id FROM section_subjects WHERE id = :ss)"
                " ORDER BY student_id LIMIT 70"), {"ss": dsa_ss}).scalars().all()
            exps = sess.execute(text(
                "SELECT id, exp_number, grade_scale FROM experiments"
                " WHERE subject_id = (SELECT subject_id FROM section_subjects WHERE id = :ss)"
                " AND institution_id = :i ORDER BY exp_number"),
                {"ss": dsa_ss, "i": inst}).mappings().all()
            graded_by = instructor
            for si, student in enumerate(cohort):
                tier = [0.94, 0.86, 0.72, 0.55, 0.4, 0.66, 0.9, 0.5, 0.78, 0.62][si % 10]
                for ei, exp in enumerate(exps):
                    week = ei % 10  # spread labs over 10 of the 12 weeks
                    day = TODAY - timedelta(weeks=(11 - week)) - timedelta(days=2)
                    grade_pct = round(100 * min(1.0, max(0.15, tier + RNG.uniform(-0.08, 0.08))), 1)
                    gid = uid(f"gradehist:{dsa_ss}:{student}:{exp['id']}")
                    if sess.execute(text("SELECT 1 FROM grades WHERE id=:i"),
                                    {"i": gid}).first():
                        continue
                    graded_at = dt(day, 16, 30)
                    sess.execute(text(
                        "INSERT INTO grades (id, student_id, experiment_id,"
                        " auto_grade, final_grade, graded_by, graded_at,"
                        " created_at, is_locked)"
                        " VALUES (:id, :s, :e, :ag, :fg, :by, :ga, :ca, true)"),
                        {"id": gid, "s": student, "e": exp["id"],
                         "ag": grade_pct, "fg": grade_pct, "by": graded_by,
                         "ga": graded_at, "ca": graded_at})
                    made += 1
        sess.commit()
        print(f"[H] grade history rows created: {made}")

        print("GREENWOOD gap-fill complete.")


if __name__ == "__main__":
    main()
