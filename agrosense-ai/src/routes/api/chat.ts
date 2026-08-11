import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

const SYSTEM_PROMPT = `You are AgroSense AI, an expert agronomy assistant embedded in a soil health analysis dashboard.
You advise on soil chemistry (N, P, K, pH, organic matter), moisture, climate variables and crop selection.
Rules:
- Use the provided soil analysis context when answering; reference concrete numbers.
- Give practical, quantified guidance (fertiliser rates in kg/ha, amendments, irrigation, crop rotation).
- Be concise: short paragraphs or tight bullet lists. No markdown headings.
- If context is missing, tell the user to run an analysis first, then answer generally.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "AI service is not configured." }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        let body: { messages?: UIMessage[]; soilContext?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (messages.length === 0) {
          return new Response(JSON.stringify({ error: "No messages provided." }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const context = body.soilContext
          ? `Current soil analysis context (JSON):\n${JSON.stringify(body.soilContext)}`
          : "No soil analysis has been run yet in this session.";

        const provider = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: {
            "Lovable-API-Key": apiKey,
            "X-Lovable-AIG-SDK": "vercel-ai-sdk",
          },
        });

        try {
          const result = streamText({
            model: provider.responses("openai/gpt-5.6-sol"),
            system: `${SYSTEM_PROMPT}\n\n${context}`,
            messages: await convertToModelMessages(messages),
            providerOptions: {
              openai: {
                forceReasoning: true,
                reasoningEffort: "low",
                reasoningSummary: "auto",
                store: false,
                include: ["reasoning.encrypted_content"],
              },
            },
          });

          return result.toUIMessageStreamResponse({ sendReasoning: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : "AI request failed.";
          return new Response(JSON.stringify({ error: message }), {
            status: 502,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
