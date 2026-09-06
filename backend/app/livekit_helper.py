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


def control_participant(
    room_name: str,
    identity: str,
    action: str,
    value: bool = True,
) -> dict | None:
    """Server-side participant control for the conductor's Student Controls.

    action='mute'   → mute/unmute the participant's microphone track
    action='camera' → mute/unmute the participant's camera track
    action='remove' → kick the participant out of the room

    Returns {'ok': True, 'detail': ...} on success, {'ok': False, 'error': ...}
    when the participant/track is not in the room, or None when LiveKit is not
    configured so callers can fall back to a chat-based request.
    """
    if not _configured():
        return None
    try:
        import asyncio
        from livekit.api import (
            LiveKitAPI, ListParticipantsRequest, MuteRoomTrackRequest,
            RoomParticipantIdentity, TrackSource,
        )
        cfg = current_app.config

        async def _run() -> dict:
            api = LiveKitAPI(cfg['LIVEKIT_URL'], cfg['LIVEKIT_API_KEY'], cfg['LIVEKIT_API_SECRET'])
            try:
                res = await api.room.list_participants(ListParticipantsRequest(room=room_name))
                target = next((p for p in res.participants if p.identity == identity), None)
                if target is None:
                    return {'ok': False, 'error': 'Participant is not in the video room.'}
                if action == 'remove':
                    await api.room.remove_participant(
                        RoomParticipantIdentity(room=room_name, identity=identity))
                    return {'ok': True, 'detail': 'removed'}
                want = TrackSource.MICROPHONE if action == 'mute' else TrackSource.CAMERA
                track = next((t for t in target.tracks if t.source == want), None)
                if track is None:
                    return {'ok': False, 'error': 'That track is not published.'}
                await api.room.mute_published_track(MuteRoomTrackRequest(
                    room=room_name, identity=identity, track_sid=track.sid, muted=value))
                return {'ok': True, 'detail': 'muted' if value else 'unmuted'}
            finally:
                await api.aclose()

        return asyncio.run(_run())
    except Exception as exc:
        # LiveKit creates rooms lazily on first join, so a room that no browser
        # has connected to yet raises a not_found ServerError. That is a normal
        # "no one has joined" state, not a misconfiguration — surface it as a
        # soft failure (route → 404) instead of None (route → 503 "not configured").
        status = getattr(exc, 'status', None)
        code = getattr(exc, 'code', None)
        if status == 404 or code == 'not_found':
            return {'ok': False, 'error': 'No one has joined the video room yet.'}
        current_app.logger.warning('livekit control_participant failed: %s', exc)
        return None
