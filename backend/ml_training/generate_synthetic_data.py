"""
Generate synthetic behavioral training data for the Focus Score RF model.

This simulates 6 months of student behavioral signals across 3 categories:
  - FOCUSED students   (label=0) : low tab switches, low idle, steady typing
  - DISTRACTED students (label=1) : high tab switches, high idle, erratic
  - SUSPICIOUS students (label=1) : high copy-paste, fast completion, low typing

Generates: ml_training/datasets/synthetic_focus_data.csv
Then run:  python ml_training/train_focus_model.py
"""
import numpy as np
import pandas as pd
import os

np.random.seed(42)
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), 'datasets', 'synthetic_focus_data.csv')

def focused_student(n=1200):
    """Simulate a student who is genuinely working."""
    return pd.DataFrame({
        'tab_switches_per_min':   np.clip(np.random.exponential(0.3, n), 0, 3),
        'idle_seconds':           np.clip(np.random.normal(15, 10, n), 0, 60),
        'typing_speed_wpm':       np.clip(np.random.normal(38, 8, n), 10, 80),
        'backspace_ratio':        np.clip(np.random.normal(0.12, 0.05, n), 0, 0.5),
        'copy_paste_count':       np.clip(np.random.poisson(0.5, n), 0, 5),
        'window_focus_ratio':     np.clip(np.random.normal(0.92, 0.05, n), 0.6, 1.0),
        'label': 0   # focused
    })

def distracted_student(n=800):
    """Simulate a student who is switching tabs / browsing / chatting."""
    return pd.DataFrame({
        'tab_switches_per_min':   np.clip(np.random.normal(4.5, 1.5, n), 1, 12),
        'idle_seconds':           np.clip(np.random.normal(90, 40, n), 20, 300),
        'typing_speed_wpm':       np.clip(np.random.normal(15, 8, n), 2, 40),
        'backspace_ratio':        np.clip(np.random.normal(0.22, 0.08, n), 0, 0.6),
        'copy_paste_count':       np.clip(np.random.poisson(1.5, n), 0, 8),
        'window_focus_ratio':     np.clip(np.random.normal(0.55, 0.15, n), 0.1, 0.85),
        'label': 1   # distracted
    })

def suspicious_student(n=400):
    """Simulate a student who is copying code / cheating."""
    return pd.DataFrame({
        'tab_switches_per_min':   np.clip(np.random.normal(6, 2, n), 2, 15),
        'idle_seconds':           np.clip(np.random.normal(5, 3, n), 0, 30),
        'typing_speed_wpm':       np.clip(np.random.normal(8, 4, n), 1, 20),
        'backspace_ratio':        np.clip(np.random.normal(0.05, 0.03, n), 0, 0.2),
        'copy_paste_count':       np.clip(np.random.normal(6, 2, n), 2, 15),
        'window_focus_ratio':     np.clip(np.random.normal(0.70, 0.10, n), 0.3, 0.95),
        'label': 1   # suspicious = also unfocused
    })

def add_noise(df, noise_pct=0.08):
    """Flip a small percentage of labels to simulate real-world noise."""
    flip_idx = np.random.choice(len(df), size=int(len(df) * noise_pct), replace=False)
    df = df.copy()
    df.loc[flip_idx, 'label'] = 1 - df.loc[flip_idx, 'label']
    return df


if __name__ == '__main__':
    print("Generating synthetic behavioral dataset...")

    df = pd.concat([
        focused_student(1200),
        distracted_student(800),
        suspicious_student(400),
    ], ignore_index=True)

    # Shuffle rows
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    df = add_noise(df)

    # Round to realistic precision
    df['tab_switches_per_min'] = df['tab_switches_per_min'].round(2)
    df['idle_seconds']         = df['idle_seconds'].round(1)
    df['typing_speed_wpm']     = df['typing_speed_wpm'].round(1)
    df['backspace_ratio']      = df['backspace_ratio'].round(3)
    df['copy_paste_count']     = df['copy_paste_count'].astype(int)
    df['window_focus_ratio']   = df['window_focus_ratio'].round(3)
    df['label']                = df['label'].astype(int)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    df.to_csv(OUTPUT_PATH, index=False)

    print(f"✅ Saved: {OUTPUT_PATH}")
    print(f"   Total rows  : {len(df):,}")
    print(f"   Focused  (0): {(df.label==0).sum():,}  ({100*(df.label==0).mean():.0f}%)")
    print(f"   Unfocused(1): {(df.label==1).sum():,}  ({100*(df.label==1).mean():.0f}%)")
    print(f"\nFeatures: {list(df.columns[:-1])}")
    print("\nNow run: python ml_training/train_focus_model.py")
