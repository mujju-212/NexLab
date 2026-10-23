"""
Composite scoring helpers.

P4: a composite never imputes a value for a factor that was not measured. It
renormalises the configured weights over the factors that *are* available and
reports `coverage`, so the UI can show "3 of 5 factors" instead of a silently
distorted score.
"""

from typing import Any, Dict, Iterable, List, Optional


def metric_value(box: Any) -> Optional[float]:
    """Return the numeric value of a metric box, or None when it was not measured."""
    if box is None:
        return None
    if isinstance(box, (int, float)):
        return float(box)
    if isinstance(box, dict):
        if box.get('is_available') is False:
            return None
        v = box.get('value')
        if v is None:
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None
    return None


def weighted_composite(
    components: Dict[str, Optional[float]],
    weights: Dict[str, float],
) -> Dict[str, Any]:
    """
    Weighted mean over the components that are available, with the weights
    rescaled to sum to 1 across those components only.
    """
    available = {
        k: float(v)
        for k, v in components.items()
        if k in weights and v is not None
    }
    total_configured = sum(weights.values()) or 1.0
    if not available:
        return {
            'score': None,
            'coverage': 0.0,
            'weights_used': {},
            'available': [],
            'missing': sorted(weights.keys()),
        }

    used_weight = sum(weights[k] for k in available) or 1.0
    score = sum(weights[k] * available[k] for k in available) / used_weight

    return {
        'score': round(score, 2),
        'coverage': round(used_weight / total_configured, 3),
        'weights_used': {k: round(weights[k] / used_weight, 4) for k in sorted(available)},
        'available': sorted(available.keys()),
        'missing': sorted(set(weights.keys()) - set(available.keys())),
    }


def percentile_of(
    value: Optional[float],
    population: Optional[Iterable[float]],
    min_cohort: int = 5,
) -> Optional[float]:
    """
    Mid-rank percentile. Returns None when the cohort is too small to be
    meaningful (a single student is not "top 1%").
    """
    if value is None or population is None:
        return None
    pop = [float(p) for p in population if p is not None]
    if len(pop) < max(2, min_cohort):
        return None
    below = sum(1 for p in pop if p < value)
    equal = sum(1 for p in pop if p == value)
    return round(100.0 * (below + 0.5 * equal) / len(pop), 1)


def safe_ratio(numerator: Optional[float], denominator: Optional[float], scale: float = 100.0) -> Optional[float]:
    """Percentage that returns None instead of 0 when the denominator is empty."""
    if numerator is None or denominator in (None, 0):
        return None
    return round(float(numerator) / float(denominator) * scale, 1)


def delta_vs_previous(
    current: Optional[float],
    previous: Optional[float],
    absolute: bool = False,
) -> Dict[str, Any]:
    """
    A delta is only reported when both sides of the comparison are real.
    `absolute=True` gives percentage-point difference (used for grade/rate points).
    """
    if current is None or previous is None:
        return {'delta': None, 'direction': 'flat', 'is_available': False}

    diff = float(current) - float(previous)
    if not absolute and previous not in (0, None):
        diff = (float(current) - float(previous)) / abs(float(previous)) * 100.0

    direction = 'up' if diff > 0.05 else ('down' if diff < -0.05 else 'flat')
    return {
        'delta': round(diff, 1),
        'direction': direction,
        'is_available': True,
        'previous': round(float(previous), 2),
    }


def pluralize(count: int, singular: str, plural: Optional[str] = None) -> str:
    return singular if int(count) == 1 else (plural or singular + 's')


def labels_for(keys: List[str]) -> List[str]:
    return [k.replace('_', ' ').title() for k in keys]
