"""
Seed and calibrate StudentRanking and RankSnapshot database tables
for all 28 students in the institution.

Ensures 100% real database records for:
1. Multi-Scope Leaderboard (Section, Subject, Department, Year Cohort, Institution)
2. Exact ranking positions, scores, and component balances:
   - Rank 1: Anaya Kulkarni (NDU2024014) - Score 87, 100th percentile, Top 1%
   - Rank 2: Vihaan Bose (NDU2024013) - Score 84, 96th percentile, Top 4%
   - Rank 3: Navya Shetty (NDU2024016) - Score 83, 93rd percentile, Top 7%
   - Rank 4: Sneha P (NDU2024015) - Score 81, 89th %ile
   - Rank 5: Ananya Iyer (NDU2024004) - Score 78, 86th %ile
   - Rank 6: Vivaan Reddy (NDU2024003) - Score 78, 82nd %ile
   - Rank 7: Shaurya Ghosh (NDU2024017) - Score 75, 79th %ile
   - Rank 8: Nidhi Desai (—) - Score 74, 75th %ile (insufficient data)
   - Rank 9: Amit Sharma (—) - Score 73, 71st %ile
   - Rank 10: Pari Deshmukh (NDU2024020) - Score 71, 68th %ile
   - Ranks 11-28: remaining students down to score 45
"""
import uuid
from datetime import datetime
from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.academic import SectionSubject
from app.models.knowledge import StudentRanking
from app.models.analytics_rank import RankSnapshot

def seed_rankings():
    app = create_app()
    with app.app_context():
        # Target calibration specs for the 28 students
        STUDENTS_CALIBRATION = [
            # rank 1
            {
                "name": "Anaya Kulkarni",
                "roll": "NDU2024014",
                "score": 87.0,
                "pct": 100.0,
                "badge": "Top 1%",
                "balance": [32, 18, 20, 15, 15], # mastery, engagement, effort, efficiency, consistency
                "insufficient": False,
            },
            # rank 2
            {
                "name": "Vihaan Bose",
                "roll": "NDU2024013",
                "score": 84.0,
                "pct": 96.0,
                "badge": "Top 4%",
                "balance": [28, 22, 19, 16, 15],
                "insufficient": False,
            },
            # rank 3
            {
                "name": "Navya Shetty",
                "roll": "NDU2024016",
                "score": 83.0,
                "pct": 93.0,
                "badge": "Top 7%",
                "balance": [30, 20, 18, 17, 15],
                "insufficient": False,
            },
            # rank 4
            {
                "name": "Sneha P",
                "roll": "NDU2024015",
                "score": 81.0,
                "pct": 89.0,
                "badge": None,
                "balance": [27, 21, 20, 17, 15],
                "insufficient": False,
            },
            # rank 5
            {
                "name": "Ananya Iyer",
                "roll": "NDU2024004",
                "score": 78.0,
                "pct": 86.0,
                "badge": None,
                "balance": [22, 20, 21, 19, 18],
                "insufficient": False,
            },
            # rank 6
            {
                "name": "Vivaan Reddy",
                "roll": "NDU2024003",
                "score": 78.0,
                "pct": 82.0,
                "badge": None,
                "balance": [25, 19, 21, 18, 17],
                "insufficient": False,
            },
            # rank 7
            {
                "name": "Shaurya Ghosh",
                "roll": "NDU2024017",
                "score": 75.0,
                "pct": 79.0,
                "badge": None,
                "balance": [20, 18, 22, 20, 20],
                "insufficient": False,
            },
            # rank 8
            {
                "name": "Nidhi Desai",
                "roll": None,
                "score": 74.0,
                "pct": 75.0,
                "badge": None,
                "balance": None, # Insufficient data
                "insufficient": True,
            },
            # rank 9
            {
                "name": "Amit Sharma",
                "roll": None,
                "score": 73.0,
                "pct": 71.0,
                "badge": None,
                "balance": [18, 20, 22, 21, 19],
                "insufficient": False,
            },
            # rank 10
            {
                "name": "Pari Deshmukh",
                "roll": "NDU2024020",
                "score": 71.0,
                "pct": 68.0,
                "badge": None,
                "balance": [21, 17, 20, 20, 22],
                "insufficient": False,
            },
            # rank 11 - 28
            { "name": "Aadhya Pillai", "roll": "NDU2024012", "score": 70.0, "pct": 64.0, "balance": [22, 20, 20, 19, 19], "insufficient": False },
            { "name": "Saanvi Rao", "roll": "NDU2024008", "score": 69.0, "pct": 61.0, "balance": [24, 18, 21, 18, 19], "insufficient": False },
            { "name": "Diya Patel", "roll": "NDU2024011", "score": 68.0, "pct": 57.0, "balance": [21, 21, 20, 19, 19], "insufficient": False },
            { "name": "Krishna Verma", "roll": "NDU2024009", "score": 66.0, "pct": 54.0, "balance": [20, 19, 22, 20, 19], "insufficient": False },
            { "name": "Advik Kapoor", "roll": "NDU2024021", "score": 65.0, "pct": 50.0, "balance": [23, 18, 20, 20, 19], "insufficient": False },
            { "name": "Aisha Khan", "roll": "NDU2024024", "score": 63.0, "pct": 46.0, "balance": [22, 19, 21, 19, 19], "insufficient": False },
            { "name": "Arjun Menon", "roll": "NDU2024007", "score": 62.0, "pct": 43.0, "balance": [20, 20, 20, 20, 20], "insufficient": False },
            { "name": "Ishita Gupta", "roll": "NDU2024006", "score": 61.0, "pct": 39.0, "balance": [19, 21, 22, 19, 19], "insufficient": False },
            { "name": "Kiara Chauhan", "roll": "NDU2024018", "score": 60.0, "pct": 36.0, "balance": [22, 18, 21, 20, 19], "insufficient": False },
            { "name": "Atharv Jain", "roll": "NDU2024019", "score": 58.0, "pct": 32.0, "balance": [20, 19, 23, 19, 19], "insufficient": False },
            { "name": "Aditya Nair", "roll": "NDU2024005", "score": 57.0, "pct": 29.0, "balance": [21, 20, 20, 20, 19], "insufficient": False },
            { "name": "Dhruv Saxena", "roll": "NDU2024023", "score": 55.0, "pct": 25.0, "balance": [19, 20, 23, 19, 19], "insufficient": False },
            { "name": "Karan Mehta", "roll": "NDU2024015", "score": 54.0, "pct": 21.0, "balance": [20, 21, 21, 19, 19], "insufficient": False },
            { "name": "Reyansh Das", "roll": "NDU2024011", "score": 52.0, "pct": 18.0, "balance": [18, 20, 24, 19, 19], "insufficient": False },
            { "name": "Riya Bhat", "roll": "NDU2024022", "score": 50.0, "pct": 14.0, "balance": [20, 19, 22, 20, 19], "insufficient": False },
            { "name": "Rahul Kumar", "roll": "NDU2024007", "score": 48.0, "pct": 11.0, "balance": [19, 18, 25, 19, 19], "insufficient": False },
            { "name": "Aryan Mehta", "roll": None, "score": 46.0, "pct": 7.0, "balance": [17, 21, 24, 19, 19], "insufficient": False },
            { "name": "Rohan Kulkarni", "roll": None, "score": 45.0, "pct": 4.0, "balance": [18, 20, 24, 19, 19], "insufficient": False },
        ]

        # Grab a target section_subject_id from the instructor
        instructor = User.query.filter_by(role='instructor').first()
        target_ss = SectionSubject.query.filter_by(instructor_id=instructor.id).first() if instructor else SectionSubject.query.first()
        if not target_ss:
            print("ERROR: No SectionSubject found!")
            return

        target_ss_id = target_ss.id
        institution_id = target_ss.institution_id or "inst-test-001"

        print(f"Calibrating rankings for SectionSubject: {target_ss_id}, Institution: {institution_id}")

        # Find or align students
        for pos, spec in enumerate(STUDENTS_CALIBRATION, start=1):
            name = spec["name"]
            user = User.query.filter(User.full_name.ilike(name)).first()
            if not user:
                user = User.query.filter(User.name.ilike(name)).first()

            if not user:
                print(f"Creating user {name}...")
                user = User(
                    id=str(uuid.uuid4()),
                    email=f"{name.lower().replace(' ', '.')}@student.nexlab.demo",
                    full_name=name,
                    name=name,
                    role="student",
                    roll_number=spec["roll"],
                    institution_id=institution_id,
                    is_active=True,
                )
                db.session.add(user)
                db.session.flush()
            else:
                # Update roll if specified
                if spec["roll"] and user.roll_number != spec["roll"]:
                    user.roll_number = spec["roll"]

            # Calculate raw component scores corresponding to the desired percentage contributions
            # rank_score = 0.30*M + 0.20*Eng + 0.20*Eff + 0.15*Efc + 0.15*Con
            score = spec["score"]
            if spec["balance"]:
                b = spec["balance"] # percentages [m%, eng%, eff%, efc%, con%]
                m_score = (b[0] / 100.0 * score) / 0.30
                eng_score = (b[1] / 100.0 * score) / 0.20
                eff_score = (b[2] / 100.0 * score) / 0.20
                efc_score = (b[3] / 100.0 * score) / 0.15
                con_score = (b[4] / 100.0 * score) / 0.15
            else:
                # Insufficient activity
                m_score = 70.0
                eng_score = 40.0
                eff_score = 35.0
                efc_score = 65.0
                con_score = 50.0

            # Upsert into StudentRanking
            existing_sr = StudentRanking.query.filter_by(
                student_id=user.id,
                section_subject_id=target_ss_id,
            ).first()

            if not existing_sr:
                existing_sr = StudentRanking(
                    id=str(uuid.uuid4()),
                    student_id=user.id,
                    section_subject_id=target_ss_id,
                    institution_id=institution_id,
                )
                db.session.add(existing_sr)

            existing_sr.mastery_score = round(m_score, 1)
            existing_sr.engagement_score = round(eng_score, 1)
            existing_sr.effort_score = round(eff_score, 1)
            existing_sr.efficiency_score = round(efc_score, 1)
            existing_sr.consistency_score = round(con_score, 1)
            existing_sr.rank_score = score
            existing_sr.rank_position = pos
            existing_sr.updated_at = datetime.utcnow()

            # Also upsert into RankSnapshot for scopes:
            # 'section', 'subject', 'department', 'year', 'institution'
            scopes = ['section', 'subject', 'department', 'year', 'institution']
            for sc in scopes:
                # Slight variation per scope for realism
                sc_score = score
                sc_pos = pos
                if sc == 'subject':
                    # minor variance
                    sc_score = round(max(40.0, min(99.0, score + ((pos % 3) - 1) * 1.5)), 1)
                elif sc == 'department':
                    sc_score = round(max(40.0, min(99.0, score + ((pos % 5) - 2) * 1.2)), 1)
                elif sc == 'institution':
                    sc_score = round(max(40.0, min(99.0, score)), 1)

                snap = RankSnapshot.query.filter_by(
                    student_id=user.id,
                    scope_level=sc,
                    period='live',
                ).first()

                if not snap:
                    snap = RankSnapshot(
                        id=str(uuid.uuid4()),
                        student_id=user.id,
                        institution_id=institution_id,
                        scope_level=sc,
                        scope_id=target_ss_id if sc == 'section' else None,
                        period='live',
                    )
                    db.session.add(snap)

                snap.mastery_score = round(m_score, 1)
                snap.engagement_score = round(eng_score, 1)
                snap.effort_score = round(eff_score, 1)
                snap.efficiency_score = round(efc_score, 1)
                snap.consistency_score = round(con_score, 1)
                snap.rank_score = sc_score
                snap.rank_position = sc_pos
                snap.cohort_size = len(STUDENTS_CALIBRATION)
                snap.percentile = spec["pct"]
                snap.computed_at = datetime.utcnow()

        db.session.commit()
        print(f"SUCCESS: Successfully calibrated 28 students into StudentRanking and RankSnapshot!")

if __name__ == "__main__":
    seed_rankings()
