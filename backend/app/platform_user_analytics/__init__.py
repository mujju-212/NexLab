"""
Platform User Analytics Package
Exports platform_user_analytics_bp and platform analytics helpers.
"""
from app.platform_user_analytics.routes import platform_user_analytics_bp
from app.platform_user_analytics.course_stats import get_user_course_analytics
from app.platform_user_analytics.activity import (
    get_platform_user_activity,
    get_platform_user_accuracy_and_bests,
    get_platform_user_recommendations,
)

__all__ = [
    'platform_user_analytics_bp',
    'get_user_course_analytics',
    'get_platform_user_activity',
    'get_platform_user_accuracy_and_bests',
    'get_platform_user_recommendations',
]
