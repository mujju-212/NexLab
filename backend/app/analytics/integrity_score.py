"""Severity-weighted integrity scoring — the single source of truth.

Every proctor event carries a severity that the recording side already assigns
(`tab_switch`/`fullscreen_exit`/`paste`/`devtools`/`screen_share_stop` are high or
medium, `context_menu` is low). The old formula ignored severity completely and
hardcoded four event types, so the single most suspicious signal available —
a student stopping their screen share mid-proctored-exam — contributed 0.0.

Rules:
  * penalty is driven by SEVERITY, so a newly added event type is scored
    correctly the moment it is recorded, with no code change;
  * every distinct event type is reported in the breakdown, so the counts an
    instructor sees always sum to the same `total`;
  * the score floors at 0 and never rises above 100.
"""

# How much one occurrence of an event costs, by severity.
SEVERITY_PENALTY = {
    'high':   6.0,
    'medium': 2.5,
    'low':    1.0,
}

# Every event type the proctoring layer can record. Kept here so the breakdown
# can show a zero for types that did not occur (an instructor should be able to
# see "screen share never stopped" rather than guess it was not tracked).
KNOWN_EVENT_TYPES = (
    'tab_switch',
    'fullscreen_exit',
    'paste',
    'copy_paste',
    'devtools',
    'screen_share_stop',
    'focus_lost',
    'lockdown_violation',
    'context_menu',
    'force_submit',
)

# Records of instructor actions (not student behaviour) are stored in the same
# table so they can be replayed to a reconnecting client. They must never cost
# a student any integrity, so they are counted and then ignored by the scorer.
NON_PENALISED_EVENT_TYPES = {
    'force_submit',      # instructor pressed Force Submit
    'broadcast',         # instructor broadcast a message
    'mode_change',       # conductor changed mode
    'session_extended',
}

# Some writers record a "stop" as screen_share_stop and others as share_stopped.
_ALIASES = {
    'screen_share_stopped': 'screen_share_stop',
    'screenshare_stop': 'screen_share_stop',
    'fullscreen': 'fullscreen_exit',
    'copy': 'copy_paste',
    'paste_detected': 'paste',
    'blur': 'focus_lost',
    'tab_blur': 'tab_switch',
}


def normalise_type(event_type):
    raw = (event_type or 'unknown').strip().lower()
    return _ALIASES.get(raw, raw)


def normalise_severity(severity):
    sev = (severity or 'low').strip().lower()
    return sev if sev in SEVERITY_PENALTY else 'low'


def score_events(events):
    """Score a list of proctor events.

    `events` items may be dicts (`event_type`, `severity`) or (type, severity, n)
    triples already aggregated. Returns a dict ready to hand to the UI.
    """
    per_type = {t: 0 for t in KNOWN_EVENT_TYPES}
    per_severity = {s: 0 for s in SEVERITY_PENALTY}
    penalty = 0.0

    for ev in events:
        if isinstance(ev, dict):
            etype, sev, count = ev.get('event_type'), ev.get('severity'), 1
        else:
            etype, sev, count = ev
        etype = normalise_type(etype)
        sev = normalise_severity(sev)
        count = int(count or 0)

        per_type[etype] = per_type.get(etype, 0) + count
        if etype in NON_PENALISED_EVENT_TYPES:
            continue
        per_severity[sev] += count
        penalty += count * SEVERITY_PENALTY[sev]

    return {
        'integrity_score': max(0.0, round(100.0 - min(100.0, penalty), 1)),
        'penalty': round(penalty, 1),
        'per_type': per_type,
        'per_severity': per_severity,
        'total': sum(per_type.values()),
    }
