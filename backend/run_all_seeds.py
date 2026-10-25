"""
run_all_seeds.py — Sequentially executes all database seeding scripts:
1. database/seed_test_users.py
2. database/seed_institution_demo.py
3. database/seed_full_demo.py
4. database/seed_platform_courses.py
5. database/seed_simulation_courses.py
6. scripts/seed_problems.py
7. seed_test_cases.py
8. seed_lab_content.py
"""

import os
import sys
import subprocess

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

backend_dir = os.path.dirname(os.path.abspath(__file__))

scripts_to_run = [
    "database/seed_test_users.py",
    "database/seed_institution_demo.py",
    "database/seed_full_demo.py",
    "database/seed_platform_courses.py",
    "database/seed_simulation_courses.py",
    "scripts/seed_problems.py",
    "seed_test_cases.py",
    "seed_lab_content.py",
    "seed_help_demo.py"
]

print("=" * 70)
print("🚀 RUNNING ALL DATABASE SEEDING SCRIPTS FOR NEXLAB PLATFORM")
print("=" * 70)

for script in scripts_to_run:
    full_path = os.path.join(backend_dir, script)
    if not os.path.exists(full_path):
        print(f"⚠️ Warning: Script not found: {script}")
        continue
    
    print(f"\n▶️ Running {script}...")
    res = subprocess.run([sys.executable, full_path], cwd=backend_dir, capture_output=True, text=True)
    if res.returncode == 0:
        print(f"✅ {script} completed successfully!")
        if res.stdout:
            lines = res.stdout.strip().split("\n")
            for line in lines[-5:]:
                print(f"   {line}")
    else:
        print(f"❌ Error in {script}:")
        print(res.stderr or res.stdout)

print("\n" + "=" * 70)
print("🎉 ALL DATABASE SEED SCRIPTS EXECUTED!")
print("=" * 70)
