"""Runtime availability for server-side code execution.

The infrastructure switch prevents attempts when Docker is absent; the
platform setting is the administrator's live kill switch. Both must be on.
"""
from flask import current_app


def execution_is_enabled() -> bool:
    if not current_app.config.get('DOCKER_RUNNER_ENABLED', False):
        return False
    try:
        from app.models.institution import PlatformConfig
        return str(PlatformConfig.get('code_execution_enabled', 'true')).strip().lower() == 'true'
    except Exception:
        # Fail closed if the platform control cannot be read.
        current_app.logger.exception('Could not read the platform code-execution flag')
        return False
