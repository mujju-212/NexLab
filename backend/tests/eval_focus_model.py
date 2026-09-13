"""
Focus Model Evaluation — generates real metrics for the research paper.
Run: cd backend && venv/Scripts/python.exe tests/eval_focus_model.py
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.metrics import (
    roc_auc_score, accuracy_score, precision_score, recall_score,
    f1_score, classification_report, confusion_matrix
)

DATASET = os.path.join(os.path.dirname(__file__), '..', 'ml_training', 'datasets', 'synthetic_focus_data.csv')
OUTPUT  = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', '06-paper', 'evaluation_results', 'focus_model_eval.json')

FEATURES = [
    'tab_switches_per_min', 'idle_seconds', 'typing_speed_wpm',
    'backspace_ratio', 'copy_paste_count', 'window_focus_ratio',
]

def main():
    df = pd.read_csv(DATASET)
    print(f"Dataset: {len(df)} samples")
    print(f"Class distribution:\n{df['label'].value_counts().to_dict()}")

    X = df[FEATURES].values
    y = df['label'].values

    # 80/20 stratified split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Train with same hyperparameters as production
    rf = RandomForestClassifier(
        n_estimators=100, max_depth=10, min_samples_split=5,
        min_samples_leaf=2, class_weight='balanced', random_state=42, n_jobs=-1
    )
    rf.fit(X_train, y_train)

    # Predictions
    y_pred  = rf.predict(X_test)
    y_proba = rf.predict_proba(X_test)[:, 1]

    # Metrics
    auc       = roc_auc_score(y_test, y_proba)
    accuracy  = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred, average='weighted')
    recall    = recall_score(y_test, y_pred, average='weighted')
    f1        = f1_score(y_test, y_pred, average='weighted')

    # Per-class
    precision_0 = precision_score(y_test, y_pred, pos_label=0)
    recall_0    = recall_score(y_test, y_pred, pos_label=0)
    f1_0        = f1_score(y_test, y_pred, pos_label=0)
    precision_1 = precision_score(y_test, y_pred, pos_label=1)
    recall_1    = recall_score(y_test, y_pred, pos_label=1)
    f1_1        = f1_score(y_test, y_pred, pos_label=1)

    cm = confusion_matrix(y_test, y_pred).tolist()

    # Cross-validation
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_auc = cross_val_score(rf, X, y, cv=cv, scoring='roc_auc')
    cv_acc = cross_val_score(rf, X, y, cv=cv, scoring='accuracy')

    # Feature importance
    importances = {FEATURES[i]: round(float(rf.feature_importances_[i]), 4)
                   for i in range(len(FEATURES))}
    importances_sorted = dict(sorted(importances.items(), key=lambda x: x[1], reverse=True))

    results = {
        'dataset_size': len(df),
        'train_size': len(X_train),
        'test_size': len(X_test),
        'class_distribution': df['label'].value_counts().to_dict(),
        'model': 'RandomForestClassifier',
        'hyperparameters': {
            'n_estimators': 100, 'max_depth': 10, 'min_samples_split': 5,
            'min_samples_leaf': 2, 'class_weight': 'balanced'
        },
        'test_metrics': {
            'auc': round(auc, 4),
            'accuracy': round(accuracy, 4),
            'precision_weighted': round(precision, 4),
            'recall_weighted': round(recall, 4),
            'f1_weighted': round(f1, 4),
        },
        'per_class': {
            'focused_0': {'precision': round(precision_0, 4), 'recall': round(recall_0, 4), 'f1': round(f1_0, 4)},
            'distracted_1': {'precision': round(precision_1, 4), 'recall': round(recall_1, 4), 'f1': round(f1_1, 4)},
        },
        'confusion_matrix': cm,
        'cross_validation': {
            'folds': 5,
            'auc_mean': round(float(cv_auc.mean()), 4),
            'auc_std': round(float(cv_auc.std()), 4),
            'auc_per_fold': [round(float(x), 4) for x in cv_auc],
            'accuracy_mean': round(float(cv_acc.mean()), 4),
            'accuracy_std': round(float(cv_acc.std()), 4),
        },
        'feature_importances': importances_sorted,
        'data_note': 'Trained and evaluated on synthetic behavioral data (2400 samples, 3 archetypes). Not validated on real student data.',
    }

    print(f"\n{'='*60}")
    print(f"TEST AUC:      {results['test_metrics']['auc']}")
    print(f"TEST ACCURACY: {results['test_metrics']['accuracy']}")
    print(f"TEST F1:       {results['test_metrics']['f1_weighted']}")
    print(f"CV AUC:        {results['cross_validation']['auc_mean']} ± {results['cross_validation']['auc_std']}")
    print(f"CV ACCURACY:   {results['cross_validation']['accuracy_mean']} ± {results['cross_validation']['accuracy_std']}")
    print(f"\nConfusion Matrix (rows=actual, cols=predicted):")
    print(f"  TN={cm[0][0]}  FP={cm[0][1]}")
    print(f"  FN={cm[1][0]}  TP={cm[1][1]}")
    print(f"\nFeature Importances:")
    for feat, imp in importances_sorted.items():
        print(f"  {feat:<30} {imp:.4f}")
    print(f"{'='*60}")

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved to {OUTPUT}")

if __name__ == '__main__':
    main()
