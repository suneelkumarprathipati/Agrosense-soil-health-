import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? "http://localhost:8000";

const OPTIMAL_RANGES = {
  nitrogen: [80, 140],
  phosphorus: [35, 70],
  potassium: [35, 60],
  ph: [6.0, 7.5],
};

const CROP_SPECS = {
  Rice: { n: 90, p: 45, k: 40, ph: 6.2, temp: 27, rain: 210 },
  Wheat: { n: 100, p: 55, k: 45, ph: 6.8, temp: 20, rain: 90 },
  Maize: { n: 110, p: 50, k: 48, ph: 6.5, temp: 25, rain: 120 },
  Cotton: { n: 120, p: 42, k: 52, ph: 7.2, temp: 30, rain: 80 },
  Pulses: { n: 45, p: 60, k: 38, ph: 7.0, temp: 24, rain: 70 },
};

const bell = (value, target, spread) =>
  100 * Math.exp(-((value - target) ** 2) / (2 * spread ** 2));

const gradeFor = (score) => (score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D");

/** Deterministic offline estimator mirroring the server scoring index. */
function estimateLocally(data) {
  const score = Math.max(
    0,
    Math.min(
      100,
      0.22 * bell(data.nitrogen, 100, 45) +
        0.18 * bell(data.phosphorus, 50, 22) +
        0.18 * bell(data.potassium, 45, 20) +
        0.22 * bell(data.ph, 6.6, 0.85) +
        0.12 * Math.min(100, ((data.organic_matter ?? 3) / 4) * 100) +
        0.08 * bell(data.moisture, 55, 20),
    ),
  );

  const raw = Object.entries(CROP_SPECS).map(([crop, s]) => {
    const dist = Math.sqrt(
      ((data.nitrogen - s.n) / 50) ** 2 +
        ((data.phosphorus - s.p) / 28) ** 2 +
        ((data.potassium - s.k) / 25) ** 2 +
        ((data.ph - s.ph) / 1) ** 2 +
        ((data.temperature - s.temp) / 8) ** 2 +
        ((data.rainfall - s.rain) / 70) ** 2,
    );
    return { crop, weight: Math.exp(-dist) };
  });
  const total = raw.reduce((acc, r) => acc + r.weight, 0) || 1;
  const recommendations = raw
    .map((r) => ({
      crop: r.crop,
      confidence: Number(((r.weight / total) * 100).toFixed(2)),
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
    .map((r) => ({
      ...r,
      suitability: r.confidence >= 60 ? "Excellent" : r.confidence >= 35 ? "Good" : "Moderate",
    }));

  const warnings = Object.entries(OPTIMAL_RANGES).map(([nutrient, [low, high]]) => {
    const value = data[nutrient];
    const status = value < low ? "Deficient" : value > high ? "Excess" : "Optimal";
    return {
      nutrient,
      value,
      status,
      recommendation:
        status === "Optimal"
          ? "Maintain current practice."
          : status === "Deficient"
            ? `Increase ${nutrient} toward ${low}–${high}.`
            : `Reduce ${nutrient} toward ${low}–${high}.`,
    };
  });

  return {
    health_score: Number(score.toFixed(2)),
    grade: gradeFor(score),
    warnings,
    recommendations,
    analyzed_at: new Date().toISOString(),
    source: "local-estimator",
  };
}

export const analyzeSoilHealth = createAsyncThunk(
  "soil/analyzeSoilHealth",
  async (sensorData, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/analyze-soil`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sensorData),
      });

      if (!response.ok) {
        const detail = await response.text();
        return rejectWithValue(detail || `Request failed with status ${response.status}`);
      }

      const payload = await response.json();
      return { ...payload, source: "ml-service" };
    } catch {
      // Inference service unreachable: fall back to the deterministic index.
      return estimateLocally(sensorData);
    }
  },
);

const initialState = {
  soilData: null,
  healthScore: null,
  grade: null,
  warnings: [],
  cropRecommendations: [],
  historicalLogs: [],
  source: null,
  loading: false,
  error: null,
};

const soilSlice = createSlice({
  name: "soil",
  initialState,
  reducers: {
    setSoilData(state, action) {
      state.soilData = action.payload;
    },
    clearAnalysis(state) {
      state.healthScore = null;
      state.grade = null;
      state.warnings = [];
      state.cropRecommendations = [];
      state.error = null;
    },
    clearHistory(state) {
      state.historicalLogs = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(analyzeSoilHealth.pending, (state, action) => {
        state.loading = true;
        state.error = null;
        state.soilData = action.meta.arg;
      })
      .addCase(analyzeSoilHealth.fulfilled, (state, action) => {
        state.loading = false;
        state.healthScore = action.payload.health_score;
        state.grade = action.payload.grade;
        state.warnings = action.payload.warnings ?? [];
        state.cropRecommendations = action.payload.recommendations ?? [];
        state.source = action.payload.source ?? null;
        state.historicalLogs = [
          {
            timestamp: action.payload.analyzed_at ?? new Date().toISOString(),
            healthScore: action.payload.health_score,
            topCrop: action.payload.recommendations?.[0]?.crop ?? "—",
            input: action.meta.arg,
          },
          ...state.historicalLogs,
        ].slice(0, 20);
      })
      .addCase(analyzeSoilHealth.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? action.error?.message ?? "Soil analysis failed.";
      });
  },
});

export const { setSoilData, clearAnalysis, clearHistory } = soilSlice.actions;

export const selectSoil = (state) => state.soil;
export const selectHealthScore = (state) => state.soil.healthScore;
export const selectCropRecommendations = (state) => state.soil.cropRecommendations;

export default soilSlice.reducer;
