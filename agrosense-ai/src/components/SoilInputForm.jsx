import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Droplets, FlaskConical, Loader2, Sprout, Thermometer, CloudRain, Wind } from "lucide-react";
import { analyzeSoilHealth } from "../store/soilSlice";

const FIELDS = [
  { key: "nitrogen", label: "Nitrogen (N)", unit: "ppm", min: 0, max: 200, step: 1, icon: Sprout },
  { key: "phosphorus", label: "Phosphorus (P)", unit: "ppm", min: 0, max: 120, step: 1, icon: FlaskConical },
  { key: "potassium", label: "Potassium (K)", unit: "ppm", min: 0, max: 120, step: 1, icon: FlaskConical },
  { key: "ph", label: "Soil pH", unit: "", min: 0, max: 14, step: 0.1, icon: FlaskConical },
  { key: "organic_matter", label: "Organic Matter", unit: "%", min: 0, max: 10, step: 0.1, icon: Sprout },
  { key: "moisture", label: "Soil Moisture", unit: "%", min: 0, max: 100, step: 1, icon: Droplets },
  { key: "temperature", label: "Temperature", unit: "°C", min: -10, max: 55, step: 0.5, icon: Thermometer },
  { key: "humidity", label: "Humidity", unit: "%", min: 0, max: 100, step: 1, icon: Wind },
  { key: "rainfall", label: "Rainfall", unit: "mm", min: 0, max: 500, step: 1, icon: CloudRain },
];

const DEFAULTS = {
  nitrogen: 95,
  phosphorus: 48,
  potassium: 44,
  ph: 6.6,
  organic_matter: 3.2,
  moisture: 52,
  temperature: 26,
  humidity: 68,
  rainfall: 140,
};

function validate(values) {
  const errors = {};
  FIELDS.forEach(({ key, label, min, max }) => {
    const value = values[key];
    if (value === "" || value === null || Number.isNaN(Number(value))) {
      errors[key] = `${label} is required`;
    } else if (Number(value) < min || Number(value) > max) {
      errors[key] = `${label} must be between ${min} and ${max}`;
    }
  });
  return errors;
}

export default function SoilInputForm() {
  const dispatch = useDispatch();
  const { loading, error } = useSelector((state) => state.soil);
  const [values, setValues] = useState(DEFAULTS);
  const [touched, setTouched] = useState({});

  const errors = useMemo(() => validate(values), [values]);
  const isValid = Object.keys(errors).length === 0;

  const update = (key, raw) => {
    setValues((prev) => ({ ...prev, [key]: raw === "" ? "" : Number(raw) }));
    setTouched((prev) => ({ ...prev, [key]: true }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setTouched(Object.fromEntries(FIELDS.map((f) => [f.key, true])));
    if (!isValid) return;
    dispatch(analyzeSoilHealth(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)]))));
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="relative rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]"
    >
      {loading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-card/80 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm font-medium text-muted-foreground">Running ML inference…</p>
        </div>
      )}

      <header className="mb-6">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Sensor & Climate Inputs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Adjust the readings below, then run the analysis pipeline.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        {FIELDS.map(({ key, label, unit, min, max, step, icon: Icon }) => {
          const invalid = touched[key] && errors[key];
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={key} className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  {label}
                </label>
                <div className="flex items-center gap-1">
                  <input
                    id={key}
                    type="number"
                    inputMode="decimal"
                    min={min}
                    max={max}
                    step={step}
                    value={values[key]}
                    onChange={(e) => update(key, e.target.value)}
                    aria-invalid={Boolean(invalid)}
                    className={`w-20 rounded-md border bg-background px-2 py-1 text-right text-sm text-foreground outline-none focus:ring-2 focus:ring-ring ${
                      invalid ? "border-destructive" : "border-input"
                    }`}
                  />
                  {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
                </div>
              </div>
              <input
                type="range"
                aria-label={`${label} slider`}
                min={min}
                max={max}
                step={step}
                value={values[key] === "" ? min : values[key]}
                onChange={(e) => update(key, e.target.value)}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
              />
              {invalid && <p className="text-xs font-medium text-destructive">{errors[key]}</p>}
            </div>
          );
        })}
      </div>

      {error && (
        <p className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {String(error)}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={loading || !isValid}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sprout className="h-4 w-4" aria-hidden="true" />}
          Analyze Soil Health
        </button>
        <button
          type="button"
          onClick={() => {
            setValues(DEFAULTS);
            setTouched({});
          }}
          className="inline-flex items-center rounded-lg border border-input bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Reset
        </button>
      </div>
    </form>
  );
}
