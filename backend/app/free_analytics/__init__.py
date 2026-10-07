"""
Free User Analytics Package
Exports free_analytics_bp and platform analytics helpers.
"""
from app.free_analytics.routes import free_analytics_bp
from app.free_analytics.course_stats import get_user_course_analytics
from app.free_analytics.activity import (
    get_free_user_activity,
    get_free_user_accuracy_and_bests,
    get_free_user_recommendations,
)

__all__ = [
    'free_analytics_bp',
    'get_user_course_analytics',
    'get_free_user_activity',
    'get_free_user_accuracy_and_bests',
    'get_free_user_recommendations',
]
