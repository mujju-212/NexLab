"""
NexLab Cohort Benchmarking Engine.
Computes cohort baselines, z-scores, and percentiles for comparative analytics.
"""
import math
import statistics
from typing import List, Dict, Any, Optional


def compute_metric_stats(values: List[float]) -> Dict[str, float]:
    """Compute mean, stdev, min, max, median for a series."""
    valid = [float(v) for v in values if v is not None and not math.isnan(v)]
    if not valid:
        return {'mean': 0.0, 'stdev': 0.0, 'min': 0.0, 'max': 0.0, 'median': 0.0, 'count': 0}

    n = len(valid)
    mean_val = statistics.mean(valid)
    stdev_val = statistics.stdev(valid) if n > 1 else 0.0
    med_val = statistics.median(valid)

    return {
        'mean': round(mean_val, 2),
        'stdev': round(stdev_val, 2),
        'min': round(min(valid), 2),
        'max': round(max(valid), 2),
        'median': round(med_val, 2),
        'count': n,
    }


def compute_z_score(val: Optional[float], mean_val: float, stdev_val: float) -> float:
    """Standard normal z-score."""
    if val is None or stdev_val <= 1e-6:
        return 0.0
    return round((float(val) - mean_val) / stdev_val, 2)


def compute_percentile(val: Optional[float], all_values: List[float]) -> float:
    """Percentile rank (0–100) within cohort."""
    if val is None or not all_values:
        return 50.0
    valid = sorted([float(v) for v in all_values if v is not None])
    if not valid:
        return 50.0
    n = len(valid)
    less = sum(1 for v in valid if v < val)
    equal = sum(1 for v in valid if v == val)
    pct = ((less + 0.5 * equal) / n) * 100.0
    return round(max(0.0, min(100.0, pct)), 1)


def compute_cohort_benchmarks(
    entities: List[Dict[str, Any]],
    metric_keys: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Given a list of entities (e.g. sections or departments) with metric dicts,
    calculate baseline statistics and attach z-score + percentile for each metric.
    """
    keys = metric_keys or ['grade_avg', 'attendance_rate', 'focus_avg', 'risk_score']
    
    # 1. Collect distributions per key
    distributions = {k: [] for k in keys}
    for e in entities:
        for k in keys:
            v = e.get(k)
            if isinstance(v, dict):
                v = v.get('value')
            if v is not None:
                distributions[k].append(float(v))

    # 2. Compute baselines
    baselines = {k: compute_metric_stats(distributions[k]) for k in keys}

    # 3. Enrich each entity with benchmark scores
    enriched = []
    for e in entities:
        item = dict(e)
        benchmarks = {}
        for k in keys:
            raw_v = item.get(k)
            if isinstance(raw_v, dict):
                val = raw_v.get('value')
            else:
                val = float(raw_v) if raw_v is not None else None

            stats = baselines[k]
            z = compute_z_score(val, stats['mean'], stats['stdev'])
            pct = compute_percentile(val, distributions[k])

            status = 'average'
            if z >= 1.0:
                status = 'above_average'
            elif z <= -1.0:
                status = 'below_average'

            benchmarks[k] = {
                'value': val,
                'z_score': z,
                'percentile': pct,
                'relative_status': status,
                'baseline_mean': stats['mean'],
            }

        item['benchmarks'] = benchmarks
        enriched.append(item)

    return {
        'baselines': baselines,
        'entities': enriched,
        'entity_count': len(entities),
    }
