"""
Student-Facing Analytics Package
Provides self-scoped Track 1 Academic, Track 2 Platform, and Blended Knowledge Map analytics.
"""
from app.student_analytics.routes import student_facing_analytics_bp, platform_public_bp

__all__ = ['student_facing_analytics_bp', 'platform_public_bp']
