"""
Train the Behavioral Focus Score Random Forest model.
Run this ONCE before starting the backend.

Usage:
    cd backend
    python ml_training/train_focus_model.py

Output:
    ml_models/focus_rf.pkl
"""
import os
import sys
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import roc_auc_score, classification_report, confusion_matrix
from sklearn.preprocessing import LabelEncoder
import joblib

# ── Config ────────────────────────────────────────────────────────────────────
DATASET_PATH = os.path.join(os.path.dirname(__file__), 'datasets')
MODEL_OUTPUT = os.path.join(os.path.dirname(__file__), '..', 'ml_models', 'focus_rf.pkl')

# ── Feature columns — must match exactly what Flask ML endpoint sends ─────────
# These match the 6 signals from the frontend and generate_synthetic_data.py
FEATURE_COLUMNS = [
    'tab_switches_per_min',
    'idle_seconds',
    'typing_speed_wpm',
    'backspace_ratio',
    'copy_paste_count',
    'window_focus_ratio',
]

# ── Target column ─────────────────────────────────────────────────────────────
TARGET_COLUMN = 'label'   # 0 = focused, 1 = distracted/suspicious


def load_dataset():
    """Load CSV files from datasets/ folder"""
    csv_files = [f for f in os.listdir(DATASET_PATH) if f.endswith('.csv')]
    if not csv_files:
        print(f"ERROR: No CSV files found in {DATASET_PATH}")
        print("Place your behavioral dataset CSV there and run again.")
        sys.exit(1)

    dfs = []
    for csv_file in csv_files:
        path = os.path.join(DATASET_PATH, csv_file)
        print(f"Loading: {csv_file}")
        df = pd.read_csv(path)
        dfs.append(df)
        print(f"  Shape: {df.shape}")
        print(f"  Columns: {list(df.columns)}")

    combined = pd.concat(dfs, ignore_index=True)
    print(f"\nCombined dataset shape: {combined.shape}")
    return combined


def preprocess(df):
    """Select features and target, handle missing values"""
    print("\n── Preprocessing ──────────────────────────────────────────────")

    # Show available columns to help user map them
    available = list(df.columns)
    print(f"Available columns: {available}")

    # Check which feature columns exist
    missing_cols = [c for c in FEATURE_COLUMNS if c not in df.columns]
    if missing_cols:
        print(f"\nWARNING: These feature columns not found: {missing_cols}")
        print("Please update FEATURE_COLUMNS in this script to match your CSV column names.")
        print("Using available columns that match...")

    valid_features = [c for c in FEATURE_COLUMNS if c in df.columns]
    if not valid_features:
        print("\nERROR: No matching feature columns found. Update FEATURE_COLUMNS.")
        sys.exit(1)

    if TARGET_COLUMN not in df.columns:
        print(f"\nERROR: Target column '{TARGET_COLUMN}' not found.")
        print(f"Update TARGET_COLUMN. Available: {available}")
        sys.exit(1)

    X = df[valid_features].copy()
    y = df[TARGET_COLUMN].copy()

    # Handle missing values
    X = X.fillna(X.median(numeric_only=True))

    # Encode boolean columns
    for col in X.columns:
        if X[col].dtype == bool or set(X[col].unique()).issubset({0, 1, True, False}):
            X[col] = X[col].astype(int)

    print(f"Features used: {valid_features}")
    print(f"Class distribution:\n{y.value_counts()}")
    return X, y, valid_features


def train(X, y):
    """Train Random Forest and evaluate"""
    print("\n── Training ───────────────────────────────────────────────────")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"Train size: {len(X_train)}, Test size: {len(X_test)}")

    rf = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight='balanced',  # handles class imbalance
        random_state=42,
        n_jobs=-1
    )
    rf.fit(X_train, y_train)

    # ── Evaluation ────────────────────────────────────────────────────────
    y_pred  = rf.predict(X_test)
    y_proba = rf.predict_proba(X_test)[:, 1]

    auc = roc_auc_score(y_test, y_proba)
    print(f"\nTest AUC: {auc:.4f}  (target: ≥ 0.83)")

    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))

    print("Confusion Matrix:")
    print(confusion_matrix(y_test, y_pred))

    # Feature importance
    importances = sorted(zip(X.columns, rf.feature_importances_),
                         key=lambda x: x[1], reverse=True)
    print("\nFeature Importances:")
    for feat, imp in importances:
        print(f"  {feat:<35} {imp:.4f}")

    # Cross-validation
    cv_scores = cross_val_score(rf, X, y, cv=5, scoring='roc_auc')
    print(f"\n5-Fold CV AUC: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    if auc < 0.75:
        print("\nWARNING: AUC below 0.75. Consider:")
        print("  - Check if feature column names are correctly mapped")
        print("  - Check class imbalance in dataset")
        print("  - Add more training data")

    return rf, auc


def save_model(model, feature_columns, auc):
    """Save model with metadata"""
    os.makedirs(os.path.dirname(MODEL_OUTPUT), exist_ok=True)

    model_data = {
        'model': model,
        'feature_columns': feature_columns,
        'auc': auc,
        'trained_at': pd.Timestamp.now().isoformat()
    }
    joblib.dump(model_data, MODEL_OUTPUT)
    print(f"\n✅ Model saved: {MODEL_OUTPUT}")
    print(f"   AUC: {auc:.4f}")
    print(f"   Features: {feature_columns}")


if __name__ == '__main__':
    print("═" * 60)
    print("VIRTUAL LAB — Focus Score RF Model Training")
    print("═" * 60)

    os.makedirs(os.path.join(DATASET_PATH), exist_ok=True)
    os.makedirs(os.path.join(os.path.dirname(__file__), '..', 'ml_models'), exist_ok=True)

    df = load_dataset()
    X, y, features = preprocess(df)
    model, auc = train(X, y)
    save_model(model, features, auc)

    print("\nDone! Now start the Flask backend — the model will load automatically.")
