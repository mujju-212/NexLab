import sys
import json
from datetime import datetime, timedelta
from app import create_app
from app.extensions import db
from app.models.institution import Institution
from app.models.user import User

# Import analytics calculation modules
from app.analytics.metrics import resolve_window, compute_student_atomic_metrics
from app.analytics.risk import compute_student_risk, compute_cohort_risk_summary
from app.analytics.benchmark import compute_cohort_benchmarks
from app.analytics.funnel import compute_student_funnel
from app.analytics.snapshots import record_daily_snapshot_for_institution

app = create_app('development')

def audit_all_tabs():
    inst_id = 'inst-test-001'
    client = app.test_client()

    with app.app_context():
        admin = User.query.filter_by(institution_id=inst_id, role='institution_admin').first()
        if not admin:
            print("No admin user found for inst-test-001")
            return

        print(f"Auditing using Admin User: {admin.email} (ID: {admin.id}) for Institution: {inst_id}")
        
        # Helper to generate JWT token for the admin
        from flask_jwt_extended import create_access_token
        token = create_access_token(identity=admin.id, additional_claims={
            'role': admin.role,
            'institution_id': inst_id,
            'email': admin.email
        })
        headers = {'Authorization': f'Bearer {token}'}

        endpoints = [
            ("Tab 1: Overview", "/api/institution/analytics/overview"),
            ("Tab 1: Top At-Risk Table", "/api/institution/analytics/students-at-risk?threshold=0&limit=50"),
            ("Tab 2: Learning Outcomes", "/api/institution/analytics/outcomes"),
            ("Tab 3: Student Funnel", "/api/institution/analytics/funnel"),
            ("Tab 4: Cohort Benchmark", "/api/institution/analytics/benchmark"),
            ("Tab 5: Attendance Matrix", "/api/institution/analytics/attendance"),
            ("Tab 6: Grades & Marks", "/api/institution/analytics/grades"),
            ("Tab 7: Integrity Violations", "/api/institution/analytics/integrity"),
            ("Tab 8: Engagement Signals", "/api/institution/analytics/engagement"),
            ("Tab 9: Risk Early Warning (Overview)", "/api/institution/analytics/risk/overview"),
            ("Tab 9: Risk Trends", "/api/institution/analytics/risk/trends"),
            ("Tab 10: AI Usage & Telemetry", "/api/institution/analytics/ai-usage"),
            ("Tab 11: Instructors", "/api/institution/analytics/instructors"),
            ("Config: Analytics Config", "/api/institution/analytics/config"),
        ]

        print("\n" + "="*80)
        print("  SYSTEM EVALUATION & AUDIT: ALL 11 INSTITUTION ANALYTICS MODULES")
        print("="*80)

        results = {}
        for name, ep in endpoints:
            res = client.get(ep, headers=headers)
            status = res.status_code
            if status == 200:
                data = res.get_json()
                results[name] = data
                summary = {}
                if isinstance(data, dict):
                    for k, v in list(data.items())[:6]:
                        if isinstance(v, list):
                            summary[k] = f"List len={len(v)}"
                        elif isinstance(v, dict):
                            summary[k] = f"Dict keys={list(v.keys())[:4]}"
                        else:
                            summary[k] = v
                print(f"[PASS] {name} ({ep}) -> HTTP {status} | Sample Keys: {summary}")
            else:
                print(f"[FAIL] {name} ({ep}) -> HTTP {status}: {res.data.decode('utf-8')[:200]}")

        # Save results to a json file for detailed review
        with open('audit_endpoint_results.json', 'w', encoding='utf-8') as f:
            json.dump({k: (v if not isinstance(v, list) else v[:10]) for k, v in results.items()}, f, indent=2, default=str)
        print("\nAudit payload dumped to audit_endpoint_results.json successfully.")

if __name__ == '__main__':
    audit_all_tabs()
