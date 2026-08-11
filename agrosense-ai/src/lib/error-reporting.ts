/**
 * Local fallback for the optional Lovable error-reporting integration.
 *
 * Keeping this helper client-safe lets the application's error boundary render
 * even when the project is run outside the Lovable hosting environment.
 */
export function reportLovableError(
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  if (typeof window === "undefined") return;

  const details = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { error };

  // No remote reporting endpoint is configured in this project. Keep useful
  // diagnostics in the browser console without exposing data to a third party.
  console.error("Application error", { ...context, ...details });
}
