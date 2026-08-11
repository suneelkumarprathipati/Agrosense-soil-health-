import { useMemo } from "react";
import { useSelector } from "react-redux";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, AlertTriangle, CheckCircle2, Leaf, TrendingUp } from "lucide-react";

const OPTIMAL = { nitrogen: 110, phosphorus: 52, potassium: 47 };
const NUTRIENT_LABELS = { nitrogen: "Nitrogen", phosphorus: "Phosphorus", potassium: "Potassium" };
const CHART_FILLS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-5)", "var(--chart-4)"];


const STATUS_STYLES = {
  Optimal: "bg-success/15 text-success border-success/30",
  Deficient: "bg-destructive/10 text-destructive border-destructive/30",
  Excess: "bg-warning/20 text-warning-foreground border-warning/40",
};

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        STATUS_STYLES[status] ?? "border-border bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
}

function Gauge({ score }) {
  const value = Number(score ?? 0);
  const radius = 62;
  const circumference = Math.PI * radius;
  const offset = circumference * (1 - value / 100);

  return (
    <div className="relative flex h-[150px] w-[168px] items-end justify-center">
      <svg viewBox="0 0 160 90" className="h-full w-full" role="img" aria-label={`Soil health score ${value} of 100`}>
        <path
          d="M 18 82 A 62 62 0 0 1 142 82"
          fill="none"
          stroke="var(--color-secondary)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M 18 82 A 62 62 0 0 1 142 82"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute bottom-1 flex flex-col items-center">
        <span className="text-4xl font-bold tracking-tight text-foreground">{value.toFixed(0)}</span>
        <span className="text-xs uppercase tracking-wider text-muted-foreground">of 100</span>
      </div>
    </div>
  );
}

function NutrientMeter({ nutrient, value, status }) {
  const target = OPTIMAL[nutrient];
  const pct = Math.min(100, (Number(value) / (target * 1.8)) * 100);
  const barColor =
    status === "Optimal" ? "bg-success" : status === "Excess" ? "bg-warning" : "bg-destructive";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{NUTRIENT_LABELS[nutrient]}</p>
        <StatusBadge status={status} />
      </div>
      <p className="mt-2 text-2xl font-semibold text-foreground">
        {Number(value).toFixed(0)}
        <span className="ml-1 text-sm font-normal text-muted-foreground">ppm</span>
      </p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Target ≈ {target} ppm</p>
    </div>
  );
}

export default function SoilMetricsDashboard() {
  const { soilData, healthScore, grade, warnings, cropRecommendations, historicalLogs, loading, source } =
    useSelector((state) => state.soil);

  const radarData = useMemo(() => {
    if (!soilData) return [];
    return Object.keys(OPTIMAL).map((key) => ({
      nutrient: NUTRIENT_LABELS[key],
      current: Number(soilData[key] ?? 0),
      optimal: OPTIMAL[key],
    }));
  }, [soilData]);

  const npkWarnings = (warnings ?? []).filter((w) => w.nutrient in OPTIMAL);
  const criticalWarnings = (warnings ?? []).filter((w) => w.status !== "Optimal");

  if (!healthScore && !loading) {
    return (
      <section className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
        <Leaf className="h-10 w-10 text-primary" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">No analysis yet</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Submit soil and climate readings to generate the health index, nutrient diagnostics and crop recommendations.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Soil Health Index</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Grade {grade ?? "—"} · {source === "ml-service" ? "ML service" : "Local index"}
              </p>
            </div>
            <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-2 flex justify-center">
            <Gauge score={healthScore ?? 0} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
          {npkWarnings.length > 0
            ? npkWarnings.map((w) => (
                <NutrientMeter key={w.nutrient} nutrient={w.nutrient} value={w.value} status={w.status} />
              ))
            : Object.keys(OPTIMAL).map((key) => (
                <NutrientMeter key={key} nutrient={key} value={soilData?.[key] ?? 0} status="Optimal" />
              ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          <h3 className="text-sm font-semibold text-foreground">Current vs Optimal NPK</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis dataKey="nutrient" tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
                <PolarRadiusAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} />
                <Radar name="Optimal" dataKey="optimal" stroke="var(--color-chart-2)" fill="var(--color-chart-2)" fillOpacity={0.2} />
                <Radar name="Current" dataKey="current" stroke="var(--color-chart-1)" fill="var(--color-chart-1)" fillOpacity={0.45} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "0.5rem",
                    color: "var(--color-card-foreground)",
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          <h3 className="text-sm font-semibold text-foreground">Crop Recommendation Confidence</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cropRecommendations} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="crop" tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis unit="%" tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "var(--color-secondary)" }}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "0.5rem",
                    color: "var(--color-card-foreground)",
                  }}
                />
                <Bar dataKey="confidence" radius={[8, 8, 0, 0]}>
                  {cropRecommendations.map((entry, index) => (
                    <Cell key={entry.crop} fill={CHART_FILLS[index % CHART_FILLS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
            Nutrient Diagnostics
          </h3>
          <ul className="mt-4 space-y-3">
            {(criticalWarnings.length ? criticalWarnings : warnings ?? []).map((w) => (
              <li key={w.nutrient} className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium capitalize text-foreground">{w.nutrient.replace("_", " ")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{w.recommendation}</p>
                </div>
                <StatusBadge status={w.status} />
              </li>
            ))}
            {(warnings ?? []).length === 0 && (
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> No deficiencies detected.
              </li>
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
            Analysis History
          </h3>
          <ul className="mt-4 divide-y divide-border">
            {(historicalLogs ?? []).map((log) => (
              <li key={log.timestamp} className="flex items-center justify-between py-2.5">
                <span className="text-xs text-muted-foreground">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {Number(log.healthScore).toFixed(0)} · {log.topCrop}
                </span>
              </li>
            ))}
            {(historicalLogs ?? []).length === 0 && (
              <li className="py-2 text-sm text-muted-foreground">No previous runs recorded.</li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
