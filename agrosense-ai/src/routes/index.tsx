import { createFileRoute } from "@tanstack/react-router";
import { Provider } from "react-redux";
import { Leaf } from "lucide-react";
import { store } from "../store";
import SoilInputForm from "../components/SoilInputForm";
import SoilMetricsDashboard from "../components/SoilMetricsDashboard";
import AiAssistant from "../components/AiAssistant";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Soil Health & Crop Recommendation System" },
      {
        name: "description",
        content:
          "Analyze NPK, pH and climate readings to score soil health and get ML-ranked optimal crop recommendations.",
      },
      { property: "og:title", content: "AI Soil Health & Crop Recommendation System" },
      {
        property: "og:description",
        content:
          "Machine-learning soil health scoring, nutrient diagnostics and top-3 crop recommendations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <Provider store={store}>
      <main className="min-h-screen bg-background">
        <header className="border-b border-border" style={{ backgroundImage: "var(--gradient-field)" }}>
          <div className="mx-auto max-w-7xl px-6 py-10">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-foreground/15">
                <Leaf className="h-6 w-6 text-primary-foreground" aria-hidden="true" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-primary-foreground sm:text-3xl">
                  AI Soil Health Analysis & Crop Recommendation
                </h1>
                <p className="mt-1 text-sm text-primary-foreground/80">
                  Scikit-Learn inference over soil chemistry and climate telemetry.
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[420px_1fr]">
          <SoilInputForm />
          <SoilMetricsDashboard />
          <div className="lg:col-span-2">
            <AiAssistant />
          </div>
        </div>

      </main>
    </Provider>
  );
}
