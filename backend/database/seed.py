"""
Database seed script — run AFTER flask db upgrade
Seeds default environment profiles

Usage:
    cd backend
    flask db upgrade        # create all tables
    python database/seed.py # seed default data
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from dotenv import load_dotenv
load_dotenv()

from app import create_app
from app.extensions import db
from app.models.subject import EnvironmentProfile

app = create_app()

PLATFORM_ENVIRONMENTS = [
    {
        'name': 'standard-python',
        'display_name': 'Standard Python 3.11',
        'docker_image': 'python:3.11-slim',
        'pip_packages': [],
        'apt_packages': [],
    },
    {
        'name': 'standard-cpp',
        'display_name': 'C / C++17 (GCC)',
        'docker_image': 'gcc:13-bullseye',
        'pip_packages': [],
        'apt_packages': ['gcc', 'g++', 'gdb'],
    },
    {
        'name': 'standard-java',
        'display_name': 'Java 17 (OpenJDK)',
        'docker_image': 'openjdk:17-slim',
        'pip_packages': [],
        'apt_packages': [],
    },
    {
        'name': 'data-science',
        'display_name': 'Data Science (numpy, pandas, matplotlib, sklearn)',
        'docker_image': 'virtuallab/data-science:latest',
        'pip_packages': ['numpy==1.26.4', 'pandas==2.2.2', 'matplotlib==3.9.0',
                         'seaborn==0.13.2', 'scikit-learn==1.5.0'],
        'apt_packages': [],
    },
    {
        'name': 'ml-heavy',
        'display_name': 'ML / AI (torch, transformers, sklearn, opencv)',
        'docker_image': 'virtuallab/ml-heavy:latest',
        'pip_packages': ['torch==2.3.0', 'transformers==4.40.0',
                         'scikit-learn==1.5.0', 'opencv-python-headless==4.9.0.80',
                         'numpy==1.26.4', 'pandas==2.2.2'],
        'apt_packages': [],
    },
    {
        'name': 'web-backend',
        'display_name': 'Web Backend (Flask, Django, Node.js)',
        'docker_image': 'virtuallab/web-backend:latest',
        'pip_packages': ['flask==3.0.3', 'django==5.0.6', 'requests==2.32.3'],
        'apt_packages': ['nodejs', 'npm'],
    },
    {
        'name': 'networking',
        'display_name': 'Networking (scapy, socket, paramiko)',
        'docker_image': 'virtuallab/networking:latest',
        'pip_packages': ['scapy==2.5.0', 'requests==2.32.3', 'paramiko==3.4.0'],
        'apt_packages': ['iproute2', 'iputils-ping'],
    },
    {
        'name': 'security',
        'display_name': 'Cybersecurity (cryptography, pycryptodome)',
        'docker_image': 'virtuallab/security:latest',
        'pip_packages': ['cryptography==42.0.8', 'pycryptodome==3.20.0',
                         'hashlib-compat==1.0.0'],
        'apt_packages': [],
    },
]

with app.app_context():
    seeded = 0
    for env_data in PLATFORM_ENVIRONMENTS:
        existing = EnvironmentProfile.query.filter_by(name=env_data['name']).first()
        if not existing:
            profile = EnvironmentProfile(
                institution_id=None,    # NULL = platform-wide
                name=env_data['name'],
                display_name=env_data['display_name'],
                docker_image=env_data['docker_image'],
                is_platform_default=True,
                pip_packages=env_data['pip_packages'],
                apt_packages=env_data['apt_packages'],
                build_status='active',
            )
            db.session.add(profile)
            seeded += 1
            print(f"  ✅ Seeded: {env_data['display_name']}")
        else:
            print(f"  ⏭  Exists: {env_data['name']}")

    db.session.commit()
    print(f"\nDone. {seeded} environment profiles seeded.")
