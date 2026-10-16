from app import create_app
from app.models.user import User
from flask_jwt_extended import create_access_token
import requests

app = create_app()
with app.app_context():
    instructor = User.query.filter_by(role='instructor').first()
    token = create_access_token(
        identity=instructor.id,
        additional_claims={
            'role': instructor.role,
            'institution_id': instructor.institution_id,
            'must_change_password': False
        }
    )

headers = {'Authorization': f'Bearer {token}'}
resp = requests.get(
    'http://127.0.0.1:5000/api/instructor/analytics/rankings-overview?scope=section',
    headers=headers
)
print('Rankings overview status:', resp.status_code)
if resp.status_code == 200:
    data = resp.json()
    print('Scope:', data.get('scope'))
    print('Total ranked:', data.get('total_ranked'))
    print('Top 3:')
    for p in data.get('top_3', []):
        print(f"  Rank {p['rank']}: {p['student_name']} ({p['roll_number']}) - score: {p['rank_score']}, badge: {p['badge']}, pct: {p['percentile_label']}")
    print('Students sample (first 4):')
    for s in data.get('students', [])[:4]:
        print(f"  #{s['rank']} {s['student_name']} ({s['roll_number']}) - score: {s['holistic_score']}, pct: {s['cohort_percentile_label']}, balance: {s['component_balance']}")
    print('Row 8 (Nidhi Desai):')
    r8 = [s for s in data.get('students', []) if s['student_name'] == 'Nidhi Desai']
    if r8:
        print(f"  #{r8[0]['rank']} {r8[0]['student_name']} - insufficient: {r8[0]['insufficient_data']}")
else:
    print('Error:', resp.text)
