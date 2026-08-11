import { useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, Loader2, Send, Sparkles, User } from "lucide-react";

const SUGGESTIONS = [
  "How do I fix my nutrient deficiencies?",
  "Explain my soil health score.",
  "Which crop should I plant this season and why?",
];

function messageText(message) {
  return (message.parts ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export default function AiAssistant() {
  const soil = useSelector((state) => state.soil);
  const [input, setInput] = useState("");
  const listRef = useRef(null);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const busy = status === "submitted" || status === "streaming";

  const soilContext = {
    inputs: soil.soilData,
    health_score: soil.healthScore,
    grade: soil.grade,
    warnings: soil.warnings,
    recommendations: soil.cropRecommendations,
  };

  const ask = (text) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    sendMessage({ text: trimmed }, { body: { soilContext } });
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
      <header className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">AI Agronomy Assistant</h2>
          <p className="text-sm text-muted-foreground">
            Ask about your readings, amendments and crop planning.
          </p>
        </div>
      </header>

      <div
        ref={listRef}
        className="max-h-80 min-h-40 space-y-4 overflow-y-auto rounded-xl border border-border bg-background p-4"
      >
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {soil.healthScore === null
              ? "Run an analysis first for tailored advice, or ask a general agronomy question."
              : `Your soil scored ${soil.healthScore}/100 (grade ${soil.grade}). Ask me what to do next.`}
          </p>
        )}

        {messages.map((message) => {
          const mine = message.role === "user";
          return (
            <div key={message.id} className={`flex gap-3 ${mine ? "flex-row-reverse" : ""}`}>
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                {mine ? (
                  <User className="h-4 w-4 text-foreground" aria-hidden="true" />
                ) : (
                  <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
                )}
              </span>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                  mine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                }`}
              >
                {messageText(message) || (busy ? "…" : "")}
              </div>
            </div>
          );
        })}

        {busy && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Thinking…
          </p>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message || "The assistant is unavailable right now."}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => ask(suggestion)}
            disabled={busy}
            className="rounded-full border border-input bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
        className="mt-4 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask the agronomy assistant…"
          aria-label="Message the AI agronomy assistant"
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          Send
        </button>
      </form>
    </section>
  );
}
