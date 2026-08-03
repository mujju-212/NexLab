"""
ML Model 1: Behavioral Focus Scorer
- Loads trained Random Forest from ml_models/focus_rf.pkl on first call
- Predicts focus score (0-100) from 6 behavioral signals sent by client
- Falls back to rule-based formula if model not loaded
"""
import os
import warnings
import joblib
import numpy as np

# sklearn warns when model was fitted with named features but inference uses a list.
# Prediction results are identical — suppress the noise.
warnings.filterwarnings(
    'ignore',
    message='X does not have valid feature names',
    category=UserWarning,
)

_model_data = None   # module-level cache — loaded once

# Feature order MUST match train_focus_model.py FEATURE_COLUMNS
FEATURE_ORDER = [
    'tab_switches_per_min',
    'idle_seconds',
    'typing_speed_wpm',
    'backspace_ratio',
    'copy_paste_count',
    'window_focus_ratio',
]


def _get_model_path():
    base = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    return os.path.join(base, 'ml_models', 'focus_rf.pkl')


def load_model():
    global _model_data
    if _model_data is None:
        path = _get_model_path()
        if os.path.exists(path):
            _model_data = joblib.load(path)
            print(f"[FocusModel] Loaded RF model — AUC: {_model_data.get('auc', '?')}")
        else:
            print(f"[FocusModel] Model not found at {path}. Using rule-based fallback.")
    return _model_data


def extract_features(signals: dict) -> list:
    """Extract ordered feature vector. Order matches FEATURE_ORDER / training."""
    return [
        float(signals.get('tab_switches_per_min', 0)),
        float(signals.get('idle_seconds', 0)),
        float(signals.get('typing_speed_wpm', 0)),
        float(signals.get('backspace_ratio', 0)),
        float(signals.get('copy_paste_count', 0)),
        float(signals.get('window_focus_ratio', 1.0)),
    ]


def predict_focus_score(signals: dict) -> float:
    """
    Returns focus score 0-100. Higher = more focused.
    Calls RF model if loaded, otherwise falls back to rule-based.
    """
    data = load_model()
    if data and 'model' in data:
        model = data['model']
        features = extract_features(signals)
        # Class 0 = focused, Class 1 = unfocused
        # prob_focused = probability of class 0
        proba = model.predict_proba([features])[0]
        prob_focused = proba[0]
        return round(prob_focused * 100, 1)
    else:
        return _rule_based_score(signals)


def _rule_based_score(signals: dict) -> float:
    """Rule-based fallback when ML model is not loaded."""
    score = 100.0
    score -= signals.get('tab_switches_per_min', 0) * 15
    score -= (signals.get('idle_seconds', 0) / 300) * 30
    score += (signals.get('typing_speed_wpm', 0) / 60) * 10
    score -= signals.get('copy_paste_count', 0) * 5
    score += signals.get('window_focus_ratio', 1.0) * 20
    score -= 20  # base offset
    return max(0.0, min(100.0, round(score, 1)))


def get_alerts(signals: dict, focus_score: float) -> list:
    """Return list of alert codes triggered by current signals"""
    alerts = []
    if signals.get('tab_switches_per_min', 0) >= 3:
        alerts.append('tab_switch_excessive')
    if signals.get('idle_seconds', 0) > 120:
        alerts.append('idle_too_long')
    if signals.get('copy_paste_count', 0) >= 4:
        alerts.append('large_paste')
    if signals.get('window_focus_ratio', 1.0) < 0.3:
        alerts.append('window_minimized_long')
    if focus_score < 40:
        alerts.append('low_focus_score')
    return alerts
