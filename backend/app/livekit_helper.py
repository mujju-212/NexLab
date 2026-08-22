"""LiveKit Cloud helpers — room creation and JWT token generation.

The LiveKit Python SDK (`livekit>=0.11`) provides `RoomServiceClient` for
server-side room management and `AccessToken`/`VideoGrants` for JWT issuance.

All three config values (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`)
must be set in the environment; when any is missing the helpers are no-ops and
return None so callers can gracefully skip the video feature.
"""
from __future__ import annotations

from datetime import timedelta

from flask import current_app


def _configured() -> bool:
    """True when all three LiveKit config vars are present and non-empty."""
    cfg = current_app.config
    return bool(
        cfg.get('LIVEKIT_URL')
        and cfg.get('LIVEKIT_API_KEY')
        and cfg.get('LIVEKIT_API_SECRET')
    )


def create_room(room_name: str) -> None:
    """Ensure a LiveKit room exists (idempotent — no-ops if already present).

    Errors are swallowed intentionally: the room is auto-created on first
    join even without an explicit create call, so a transient failure here
    is not fatal.
    """
    if not _configured():
        return
    try:
        cfg = current_app.config
        # livekit-api >= 1.2 exposes RoomService via LiveKitAPI (async);
        # older builds exported a standalone synchronous RoomServiceClient.
        # Support both.
        import asyncio
        try:
            from livekit.api import LiveKitAPI  # type: ignore[import]

            async def _create():
                c = LiveKitAPI(cfg['LIVEKIT_URL'], cfg['LIVEKIT_API_KEY'], cfg['LIVEKIT_API_SECRET'])
                try:
                    await c.room.create_room(name=room_name)
                finally:
                    await c.aclose()

            asyncio.run(_create())
        except TypeError:
            # livekit-api >= 1.2: create_room takes a CreateRoomRequest protobuf
            try:
                from livekit.api import CreateRoomRequest  # type: ignore[import]
                from livekit.api import LiveKitAPI

                async def _create():
                    c = LiveKitAPI(cfg['LIVEKIT_URL'], cfg['LIVEKIT_API_KEY'], cfg['LIVEKIT_API_SECRET'])
                    try:
                        await c.room.create_room(CreateRoomRequest(name=room_name))
                    finally:
                        await c.aclose()

                asyncio.run(_create())
            except Exception as exc2:
                current_app.logger.warning('livekit create_room failed (non-fatal): %s', exc2)
        except ImportError:
            from livekit.api import RoomServiceClient  # type: ignore[import,no-redef]
            client = RoomServiceClient(
                cfg['LIVEKIT_URL'],
                cfg['LIVEKIT_API_KEY'],
                cfg['LIVEKIT_API_SECRET'],
            )
            client.create_room(name=room_name)
    except Exception as exc:
        current_app.logger.warning('livekit create_room failed (non-fatal): %s', exc)


def make_token(
    room_name: str,
    identity: str,
    name: str,
    can_publish: bool = True,
    can_subscribe: bool = True,
    ttl_seconds: int = 14400,  # 4 hours — covers a typical lab session
) -> str | None:
    """Generate a signed LiveKit JWT for one participant.

    Returns the JWT string, or None when LiveKit is not configured so callers
    can branch without crashing.
    """
    if not _configured():
        return None
    try:
        from livekit.api import AccessToken, VideoGrants  # type: ignore[import]
        cfg = current_app.config

        grants = VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=can_publish,
            can_subscribe=can_subscribe,
            can_publish_data=True,   # enables data-channel messages (future use)
        )
        token = (
            AccessToken(cfg['LIVEKIT_API_KEY'], cfg['LIVEKIT_API_SECRET'])
            .with_identity(identity)
            .with_name(name)
            .with_grants(grants)
            .with_ttl(timedelta(seconds=ttl_seconds))
        )
        return token.to_jwt()
    except Exception as exc:
        current_app.logger.warning('livekit make_token failed: %s', exc)
        return None
