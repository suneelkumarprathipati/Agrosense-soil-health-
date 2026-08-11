"""Training pipeline for soil health regression and optimal crop classification."""

from __future__ import annotations

import os
from dataclasses import dataclass

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    f1_score,
    mean_absolute_error,
    r2_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, StandardScaler

ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "artifacts")
FEATURES = [
    "nitrogen",
    "phosphorus",
    "potassium",
    "organic_matter",
    "ph",
    "temperature",
    "humidity",
    "rainfall",
]
CROPS = ["Rice", "Wheat", "Maize", "Cotton", "Pulses"]

OPTIMAL = {
    "Rice": dict(n=90, p=45, k=40, ph=6.2, temp=27, hum=82, rain=210, om=3.2),
    "Wheat": dict(n=100, p=55, k=45, ph=6.8, temp=20, hum=58, rain=90, om=2.8),
    "Maize": dict(n=110, p=50, k=48, ph=6.5, temp=25, hum=65, rain=120, om=3.0),
    "Cotton": dict(n=120, p=42, k=52, ph=7.2, temp=30, hum=60, rain=80, om=2.4),
    "Pulses": dict(n=45, p=60, k=38, ph=7.0, temp=24, hum=55, rain=70, om=2.6),
}


@dataclass
class TrainingReport:
    mae: float
    r2: float
    accuracy: float
    f1: float


def soil_health_score(row: pd.Series) -> float:
    """Balanced NPK / pH / organic-matter index scaled to 0-100."""
    n_score = 100 * np.exp(-((row["nitrogen"] - 100) ** 2) / (2 * 45.0**2))
    p_score = 100 * np.exp(-((row["phosphorus"] - 50) ** 2) / (2 * 22.0**2))
    k_score = 100 * np.exp(-((row["potassium"] - 45) ** 2) / (2 * 20.0**2))
    ph_score = 100 * np.exp(-((row["ph"] - 6.6) ** 2) / (2 * 0.85**2))
    om_score = 100 * np.clip(row["organic_matter"] / 4.0, 0, 1)
    moisture_score = 100 * np.exp(-((row["humidity"] - 65) ** 2) / (2 * 25.0**2))

    score = (
        0.22 * n_score
        + 0.18 * p_score
        + 0.18 * k_score
        + 0.22 * ph_score
        + 0.12 * om_score
        + 0.08 * moisture_score
    )
    return float(np.clip(score, 0, 100))


def _crop_affinity(row: pd.Series, spec: dict) -> float:
    terms = [
        ((row["nitrogen"] - spec["n"]) / 50.0) ** 2,
        ((row["phosphorus"] - spec["p"]) / 28.0) ** 2,
        ((row["potassium"] - spec["k"]) / 25.0) ** 2,
        ((row["ph"] - spec["ph"]) / 1.0) ** 2,
        ((row["temperature"] - spec["temp"]) / 8.0) ** 2,
        ((row["humidity"] - spec["hum"]) / 22.0) ** 2,
        ((row["rainfall"] - spec["rain"]) / 70.0) ** 2,
        ((row["organic_matter"] - spec["om"]) / 1.4) ** 2,
    ]
    return float(-np.sqrt(np.sum(terms)))


def label_crop(row: pd.Series) -> str:
    return max(CROPS, key=lambda crop: _crop_affinity(row, OPTIMAL[crop]))


def synthesize_dataset(n_samples: int = 12000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    df = pd.DataFrame(
        {
            "nitrogen": rng.uniform(0, 200, n_samples),
            "phosphorus": rng.uniform(0, 120, n_samples),
            "potassium": rng.uniform(0, 120, n_samples),
            "organic_matter": rng.uniform(0.2, 6.0, n_samples),
            "ph": rng.uniform(3.5, 9.5, n_samples),
            "temperature": rng.uniform(8, 45, n_samples),
            "humidity": rng.uniform(15, 98, n_samples),
            "rainfall": rng.uniform(10, 320, n_samples),
        }
    )
    df["health_score"] = df.apply(soil_health_score, axis=1)
    df["crop"] = df.apply(label_crop, axis=1)
    return df


def load_dataset(csv_path: str | None = None) -> pd.DataFrame:
    if csv_path and os.path.exists(csv_path):
        df = pd.read_csv(csv_path)
        missing = [c for c in FEATURES if c not in df.columns]
        if missing:
            raise ValueError(f"CSV missing required columns: {missing}")
        if "health_score" not in df:
            df["health_score"] = df.apply(soil_health_score, axis=1)
        if "crop" not in df:
            df["crop"] = df.apply(label_crop, axis=1)
        return df
    return synthesize_dataset()


def build_regressor() -> Pipeline:
    return Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "model",
                GradientBoostingRegressor(
                    n_estimators=400,
                    learning_rate=0.06,
                    max_depth=3,
                    subsample=0.9,
                    random_state=42,
                ),
            ),
        ]
    )


def build_classifier() -> Pipeline:
    return Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "model",
                RandomForestClassifier(
                    n_estimators=500,
                    max_depth=None,
                    min_samples_leaf=2,
                    class_weight="balanced_subsample",
                    n_jobs=-1,
                    random_state=42,
                ),
            ),
        ]
    )


def train(csv_path: str | None = None) -> TrainingReport:
    df = load_dataset(csv_path)
    x = df[FEATURES].to_numpy()
    y_reg = df["health_score"].to_numpy()

    encoder = LabelEncoder()
    y_clf = encoder.fit_transform(df["crop"].to_numpy())

    x_train, x_test, yr_train, yr_test, yc_train, yc_test = train_test_split(
        x, y_reg, y_clf, test_size=0.2, random_state=42, stratify=y_clf
    )

    regressor = build_regressor().fit(x_train, yr_train)
    classifier = build_classifier().fit(x_train, yc_train)

    reg_pred = regressor.predict(x_test)
    clf_pred = classifier.predict(x_test)

    report = TrainingReport(
        mae=float(mean_absolute_error(yr_test, reg_pred)),
        r2=float(r2_score(yr_test, reg_pred)),
        accuracy=float(accuracy_score(yc_test, clf_pred)),
        f1=float(f1_score(yc_test, clf_pred, average="weighted")),
    )

    print("=== Soil Health Regression ===")
    print(f"MAE : {report.mae:.3f}")
    print(f"R2  : {report.r2:.4f}")
    print("\n=== Optimal Crop Classification ===")
    print(f"Accuracy    : {report.accuracy:.4f}")
    print(f"Weighted F1 : {report.f1:.4f}")
    print(classification_report(yc_test, clf_pred, target_names=list(encoder.classes_)))

    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    joblib.dump(regressor, os.path.join(ARTIFACT_DIR, "soil_health_regressor.joblib"))
    joblib.dump(classifier, os.path.join(ARTIFACT_DIR, "crop_classifier.joblib"))
    joblib.dump(encoder, os.path.join(ARTIFACT_DIR, "crop_label_encoder.joblib"))
    joblib.dump({"features": FEATURES, "metrics": report.__dict__}, os.path.join(ARTIFACT_DIR, "metadata.joblib"))

    return report


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Train soil health and crop models.")
    parser.add_argument("--csv", default=None, help="Optional path to a real soil dataset CSV.")
    args = parser.parse_args()
    train(args.csv)
