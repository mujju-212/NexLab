from app import create_app
from app.models.user import User
from flask_jwt_extended import create_access_token
import requests

app = create_app()
with app.app_context():
    instructor = User.query.filter_by(role='instructor').first()
    token = create_access_token(
        identity=instructor.id,
        additional_claims={'role': instructor.role, 'institution_id': instructor.institution_id, 'must_change_password': False}
    )

headers = {'Authorization': f'Bearer {token}'}
for sc in ['Section', 'Subject', 'Department', 'Year Cohort', 'Institution']:
    r = requests.get(f'http://127.0.0.1:5000/api/instructor/analytics/rankings-overview?scope={sc}', headers=headers)
    d = r.json()
    print(f"=== Scope: {sc} (total: {d.get('total_ranked')}) ===")
    for p in d.get('top_3', []):
        print(f"  #{p['rank']} {p['student_name']} ({p['rank_score']})")
