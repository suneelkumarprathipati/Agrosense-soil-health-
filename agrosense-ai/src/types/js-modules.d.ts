declare module "*/store" {
  export const store: import("@reduxjs/toolkit").EnhancedStore;
}

declare module "*/components/SoilInputForm" {
  const SoilInputForm: React.ComponentType;
  export default SoilInputForm;
}

declare module "*/components/SoilMetricsDashboard" {
  const SoilMetricsDashboard: React.ComponentType;
  export default SoilMetricsDashboard;
}

declare module "*/components/AiAssistant" {
  const AiAssistant: React.ComponentType;
  export default AiAssistant;
}
