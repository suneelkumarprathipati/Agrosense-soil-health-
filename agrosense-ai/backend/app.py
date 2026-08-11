"""FastAPI service exposing soil health analysis and crop recommendation endpoints."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import List

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

ARTIFACT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ml_engine", "artifacts")
FEATURES = ["nitrogen", "phosphorus", "potassium", "organic_matter", "ph", "temperature", "humidity", "rainfall"]

OPTIMAL_RANGES = {
    "nitrogen": (80, 140),
    "phosphorus": (35, 70),
    "potassium": (35, 60),
    "organic_matter": (2.5, 5.0),
    "ph": (6.0, 7.5),
}

app = FastAPI(
    title="Soil Health Analysis & Crop Recommendation API",
    description="ML-backed soil scoring, nutrient diagnostics and optimal crop recommendations.",
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:8080").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class SoilPayload(BaseModel):
    nitrogen: float = Field(..., ge=0, le=300, description="Nitrogen in ppm")
    phosphorus: float = Field(..., ge=0, le=200, description="Phosphorus in ppm")
    potassium: float = Field(..., ge=0, le=200, description="Potassium in ppm")
    ph: float = Field(..., ge=0, le=14)
    moisture: float = Field(..., ge=0, le=100, description="Volumetric soil moisture %")
    humidity: float = Field(..., ge=0, le=100)
    temperature: float = Field(..., ge=-20, le=60)
    rainfall: float = Field(..., ge=0, le=1000, description="Rainfall in mm")
    organic_matter: float = Field(3.0, ge=0, le=15)


class CropRecommendation(BaseModel):
    crop: str
    confidence: float
    suitability: str


class NutrientWarning(BaseModel):
    nutrient: str
    value: float
    status: str
    recommendation: str


class AnalysisResponse(BaseModel):
    health_score: float
    grade: str
    warnings: List[NutrientWarning]
    recommendations: List[CropRecommendation]
    analyzed_at: str


class ModelRegistry:
    def __init__(self) -> None:
        self.regressor = None
        self.classifier = None
        self.encoder = None
        self.load()

    def load(self) -> None:
        try:
            self.regressor = joblib.load(os.path.join(ARTIFACT_DIR, "soil_health_regressor.joblib"))
            self.classifier = joblib.load(os.path.join(ARTIFACT_DIR, "crop_classifier.joblib"))
            self.encoder = joblib.load(os.path.join(ARTIFACT_DIR, "crop_label_encoder.joblib"))
        except Exception:  # models not trained yet -> deterministic fallback
            self.regressor = self.classifier = self.encoder = None

    @property
    def ready(self) -> bool:
        return all([self.regressor, self.classifier, self.encoder])


registry = ModelRegistry()


def heuristic_score(p: SoilPayload) -> float:
    def bell(value: float, target: float, spread: float) -> float:
        return 100 * float(np.exp(-((value - target) ** 2) / (2 * spread**2)))

    score = (
        0.22 * bell(p.nitrogen, 100, 45)
        + 0.18 * bell(p.phosphorus, 50, 22)
        + 0.18 * bell(p.potassium, 45, 20)
        + 0.22 * bell(p.ph, 6.6, 0.85)
        + 0.12 * min(100.0, p.organic_matter / 4.0 * 100)
        + 0.08 * bell(p.moisture, 55, 20)
    )
    return round(float(np.clip(score, 0, 100)), 2)


def heuristic_crops(p: SoilPayload) -> List[CropRecommendation]:
    specs = {
        "Rice": (90, 45, 40, 6.2, 27, 210),
        "Wheat": (100, 55, 45, 6.8, 20, 90),
        "Maize": (110, 50, 48, 6.5, 25, 120),
        "Cotton": (120, 42, 52, 7.2, 30, 80),
        "Pulses": (45, 60, 38, 7.0, 24, 70),
    }
    scores = {}
    for crop, (n, ph_, k, target_ph, temp, rain) in specs.items():
        dist = np.sqrt(
            ((p.nitrogen - n) / 50) ** 2
            + ((p.phosphorus - ph_) / 28) ** 2
            + ((p.potassium - k) / 25) ** 2
            + ((p.ph - target_ph) / 1.0) ** 2
            + ((p.temperature - temp) / 8) ** 2
            + ((p.rainfall - rain) / 70) ** 2
        )
        scores[crop] = float(np.exp(-dist))
    total = sum(scores.values()) or 1.0
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:3]
    return [_to_recommendation(c, v / total) for c, v in ranked]


def _to_recommendation(crop: str, prob: float) -> CropRecommendation:
    confidence = round(prob * 100, 2)
    suitability = "Excellent" if confidence >= 60 else "Good" if confidence >= 35 else "Moderate"
    return CropRecommendation(crop=crop, confidence=confidence, suitability=suitability)


def nutrient_warnings(p: SoilPayload) -> List[NutrientWarning]:
    readings = {
        "nitrogen": p.nitrogen,
        "phosphorus": p.phosphorus,
        "potassium": p.potassium,
        "organic_matter": p.organic_matter,
        "ph": p.ph,
    }
    remedies = {
        "nitrogen": ("Apply urea or legume cover cropping.", "Reduce nitrogen inputs; risk of leaching."),
        "phosphorus": ("Apply rock phosphate or DAP.", "Halt phosphate application; runoff risk."),
        "potassium": ("Apply muriate of potash or wood ash.", "Reduce potash; may block magnesium uptake."),
        "organic_matter": ("Incorporate compost and crop residue.", "Monitor mineralisation rate."),
        "ph": ("Apply agricultural lime to raise pH.", "Apply elemental sulphur to lower pH."),
    }
    out: List[NutrientWarning] = []
    for key, value in readings.items():
        low, high = OPTIMAL_RANGES[key]
        if value < low:
            out.append(NutrientWarning(nutrient=key, value=value, status="Deficient", recommendation=remedies[key][0]))
        elif value > high:
            out.append(NutrientWarning(nutrient=key, value=value, status="Excess", recommendation=remedies[key][1]))
        else:
            out.append(NutrientWarning(nutrient=key, value=value, status="Optimal", recommendation="Maintain current practice."))
    return out


def grade_for(score: float) -> str:
    if score >= 80:
        return "A"
    if score >= 65:
        return "B"
    if score >= 50:
        return "C"
    return "D"


@app.post("/api/v1/analyze-soil", response_model=AnalysisResponse, status_code=status.HTTP_200_OK)
def analyze_soil(payload: SoilPayload) -> AnalysisResponse:
    try:
        if registry.ready:
            vector = np.array(
                [[
                    payload.nitrogen,
                    payload.phosphorus,
                    payload.potassium,
                    payload.organic_matter,
                    payload.ph,
                    payload.temperature,
                    payload.humidity,
                    payload.rainfall,
                ]]
            )
            score = round(float(np.clip(registry.regressor.predict(vector)[0], 0, 100)), 2)
            probabilities = registry.classifier.predict_proba(vector)[0]
            labels = registry.encoder.inverse_transform(np.arange(len(probabilities)))
            top = sorted(zip(labels, probabilities), key=lambda kv: kv[1], reverse=True)[:3]
            recommendations = [_to_recommendation(str(c), float(v)) for c, v in top]
        else:
            score = heuristic_score(payload)
            recommendations = heuristic_crops(payload)

        return AnalysisResponse(
            health_score=score,
            grade=grade_for(score),
            warnings=nutrient_warnings(payload),
            recommendations=recommendations,
            analyzed_at=datetime.now(timezone.utc).isoformat(),
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Inference failure: {exc}") from exc


@app.get("/api/v1/health-metrics/summary")
def health_metrics_summary() -> JSONResponse:
    regions = [
        {"region": "North Basin", "avg_health_score": 78.4, "dominant_crop": "Wheat", "samples": 1284},
        {"region": "Delta Plains", "avg_health_score": 84.1, "dominant_crop": "Rice", "samples": 2043},
        {"region": "Western Belt", "avg_health_score": 61.7, "dominant_crop": "Cotton", "samples": 964},
        {"region": "Central Uplands", "avg_health_score": 70.2, "dominant_crop": "Maize", "samples": 1517},
    ]
    history = [
        {"month": m, "avg_health_score": s, "avg_ph": p}
        for m, s, p in [
            ("Jan", 68.2, 6.4), ("Feb", 69.8, 6.5), ("Mar", 71.1, 6.5),
            ("Apr", 73.4, 6.6), ("May", 72.0, 6.4), ("Jun", 75.9, 6.7),
        ]
    ]
    return JSONResponse(
        {
            "model_ready": registry.ready,
            "total_samples": sum(r["samples"] for r in regions),
            "global_avg_health_score": round(sum(r["avg_health_score"] for r in regions) / len(regions), 2),
            "regions": regions,
            "history": history,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    )


@app.get("/api/v1/health")
def healthcheck() -> dict:
    return {"status": "ok", "model_ready": registry.ready}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=False)
