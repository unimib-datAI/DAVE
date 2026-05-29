import { Router } from "express";
import { asyncRoute } from "../utils/async-route";
import { z } from "zod";
import { validateRequest } from "zod-express-middleware";
import axios from "axios";

const route = Router();

// Mirrors DEFAULT_SYSTEM_PROMPT from frontend/atoms/llmSettings.ts
const DEFAULT_SYSTEM_PROMPT = `You are an expert assistant that answers questions based on provided context.

<input>

<context>
{{CONTEXT}}
</context>

<question language="auto">
{{QUESTION}}
</question>

<instructions>
- Answer the question using ONLY information explicitly stated in the context.
- Integrate information from multiple documents only if they are consistent.
- Do NOT infer, speculate, generalize, or rely on external knowledge.
- The answer MUST be written in the same language as the question.
- If answering requires translating information from the context, translate faithfully
  without adding, omitting, or reinterpreting any content.
- Do NOT mention documents, context, retrieval, or sources explicitly.
- If the context is insufficient, incomplete, or ambiguous, respond EXACTLY with:
  "The information provided is not sufficient to answer with certainty." and give an explanation about why you can't answer.
Always assume that the user is asking you about information contained in the documents provided
- Use a clear, precise, and domain-appropriate technical style.
Make sure to ALWAYS answer in the same language used by the user to ask the question, don't ming the documents language
</instructions>

</input>`;

const ragQuerySchema = z.object({
  text: z.string().min(1),
  collectionId: z.string().optional(),
  systemPrompt: z.string().optional(),
  // JSON-encoded array of ChatMessage objects, e.g. [{"role":"user","content":"hi"}]
  messages: z.string().optional(),
  temperature: z.coerce.number().min(0).max(2).optional(),
  max_tokens: z.coerce.number().min(1).max(8192).optional(),
  top_p: z.coerce.number().min(0).max(1).optional(),
  frequency_penalty: z.coerce.number().min(0).max(2).optional(),
  model: z.string().optional(),
  retrievalMethod: z.string().optional(),
  force_rag: z.string().optional(),
  n_results: z.coerce.number().min(1).max(50).optional(),
  stream: z.string().optional(),
});

const ragBodySchema = z.object({});

export default (app) => {
  app.use("/rag", route);

  /**
   * @swagger
   * components:
   *   schemas:
   *     ChatMessage:
   *       type: object
   *       required:
   *         - role
   *         - content
   *       properties:
   *         role:
   *           type: string
   *           enum: [system, user, assistant]
   *           description: The role of the message author.
   *           example: "user"
   *         content:
   *           type: string
   *           description: The text content of the message.
   *           example: "Who was Napoleon?"
   *     RagGenerateRequest:
   *       type: object
   *       properties:
   *         systemPrompt:
   *           type: string
   *           description: |
   *             System prompt template sent to the LLM. Use `{{CONTEXT}}` as a
   *             placeholder for the retrieved document chunks and `{{QUESTION}}`
   *             for the user question. Defaults to the DAVE standard RAG prompt.
   *           default: ""
   *           example: ""
   *         messages:
   *           type: array
   *           description: Optional conversation history (previous turns). System messages are stripped and re-injected automatically. Omit or pass [] for a single-turn interaction.
   *           items:
   *             $ref: '#/components/schemas/ChatMessage'
   *           default: []
   *           example: []
   *         temperature:
   *           type: number
   *           minimum: 0
   *           maximum: 2
   *           description: Sampling temperature. Higher = more creative, lower = more deterministic.
   *           default: 0.7
   *           example: 0.7
   *         max_tokens:
   *           type: integer
   *           minimum: 1
   *           maximum: 8192
   *           description: Maximum number of tokens the LLM should generate in its reply.
   *           default: 1024
   *           example: 1024
   *         top_p:
   *           type: number
   *           minimum: 0
   *           maximum: 1
   *           description: Nucleus sampling probability mass.
   *           default: 0.65
   *           example: 0.65
   *         frequency_penalty:
   *           type: number
   *           minimum: 0
   *           maximum: 2
   *           description: Penalises token repetition. Corresponds to `defaultFrequencyPenalty` in the frontend settings.
   *           default: 1.15
   *           example: 1.15
   *         model:
   *           type: string
   *           description: LLM model name to use. Defaults to the `LLM_NAME` / `DEFAULT_MODEL` env var, then `phi4-mini`.
   *           default: ""
   *           example: ""
   *         retrievalMethod:
   *           type: string
   *           description: Vector retrieval strategy forwarded to the Chroma/embedding service. Leave empty for the service default.
   *           default: ""
   *           example: ""
   *         force_rag:
   *           type: boolean
   *           description: When true, forces RAG retrieval even if the query could be answered without context.
   *           default: true
   *           example: true
   *         n_results:
   *           type: integer
   *           minimum: 1
   *           maximum: 50
   *           description: Maximum number of document chunks to retrieve and inject into the context.
   *           default: 5
   *           example: 5
   *         stream:
   *           type: boolean
   *           description: When true the response is a plain-text stream. Set to false (default) to receive a single JSON response — recommended when testing in Swagger UI.
   *           default: false
   *           example: false
   *     RagGenerateResponse:
   *       type: object
   *       description: Returned only when stream=false.
   *       properties:
   *         content:
   *           type: string
   *           description: The full generated answer.
   *           example: "Napoleon Bonaparte was a French military leader..."
   *         model:
   *           type: string
   *           description: The model that produced the response.
   *           example: "phi4-mini"
   *         usage:
   *           type: object
   *           properties:
   *             prompt_tokens:
   *               type: integer
   *               example: 312
   *             completion_tokens:
   *               type: integer
   *               example: 98
   *             total_tokens:
   *               type: integer
   *               example: 410
   *
   * /api/rag/generate:
   *   post:
   *     summary: RAG-augmented text generation
   *     description: |
   *       Replicates the full RAG + chat pipeline used by the DAVE frontend:
   *
   *       1. **Retrieval** — queries the vector store (`/chroma/collection/{index}/query`)
   *          with the user question and optional collection filter to fetch the most
   *          relevant document chunks.
   *
   *       2. **Prompt assembly** — fills `{{CONTEXT}}` and `{{QUESTION}}` placeholders
   *          in the system prompt, then prepends any provided conversation history.
   *
   *       3. **Generation** — calls the OpenAI-compatible LLM endpoint
   *          (`API_LLM/chat/completions`) with the assembled messages and the
   *          requested sampling parameters.
   *
   *       Set `stream: false` (default) to receive a JSON response — recommended for
   *       Swagger UI. Set `stream: true` to receive the raw streamed text as the
   *       frontend does.
   *
   *       Parameters correspond directly to the frontend `LLMSettings` atom:
   *       `temperature` → `defaultTemperature`, `max_tokens` → `defaultMaxTokens`,
   *       `top_p` → `defaultTopP`, `frequency_penalty` → `defaultFrequencyPenalty`,
   *       `systemPrompt` → `defaultSystemPrompt`.
   *     tags: [RAG]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: text
   *         required: true
   *         schema:
   *           type: string
   *         description: The user question used for both retrieval and generation.
   *         example: "Who was Napoleon Bonaparte?"
   *       - in: query
   *         name: collectionId
   *         required: false
   *         schema:
   *           type: string
   *           default: ""
   *         description: Restrict document retrieval to a specific collection. Leave empty to search all collections.
   *         example: ""
   *       - in: query
   *         name: systemPrompt
   *         required: false
   *         schema:
   *           type: string
   *           default: ""
   *         description: System prompt template. Use {{CONTEXT}} and {{QUESTION}} as placeholders. Defaults to the DAVE standard RAG prompt.
   *         example: ""
   *       - in: query
   *         name: messages
   *         required: false
   *         schema:
   *           type: string
   *           default: "[]"
   *         description: "JSON-encoded conversation history (previous turns). Example: [{\"role\":\"user\",\"content\":\"hello\"}]. Leave empty for single-turn."
   *         example: "[]"
   *       - in: query
   *         name: temperature
   *         required: false
   *         schema:
   *           type: number
   *           minimum: 0
   *           maximum: 2
   *           default: 0.7
   *         description: Sampling temperature. Higher = more creative, lower = more deterministic.
   *         example: 0.7
   *       - in: query
   *         name: max_tokens
   *         required: false
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 8192
   *           default: 1024
   *         description: Maximum number of tokens the LLM should generate.
   *         example: 1024
   *       - in: query
   *         name: top_p
   *         required: false
   *         schema:
   *           type: number
   *           minimum: 0
   *           maximum: 1
   *           default: 0.65
   *         description: Nucleus sampling probability mass.
   *         example: 0.65
   *       - in: query
   *         name: frequency_penalty
   *         required: false
   *         schema:
   *           type: number
   *           minimum: 0
   *           maximum: 2
   *           default: 1.15
   *         description: Penalises token repetition.
   *         example: 1.15
   *       - in: query
   *         name: model
   *         required: false
   *         schema:
   *           type: string
   *           default: ""
   *         description: LLM model name. Defaults to LLM_NAME/DEFAULT_MODEL env var, then phi4-mini.
   *         example: ""
   *       - in: query
   *         name: retrievalMethod
   *         required: false
   *         schema:
   *           type: string
   *           default: ""
   *         description: Vector retrieval strategy forwarded to the embedding service. Leave empty for service default.
   *         example: ""
   *       - in: query
   *         name: force_rag
   *         required: false
   *         schema:
   *           type: string
   *           enum: ["true", "false"]
   *           default: "true"
   *         description: When true, forces RAG retrieval.
   *         example: "true"
   *       - in: query
   *         name: n_results
   *         required: false
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 50
   *           default: 5
   *         description: Maximum number of document chunks to retrieve and inject as context.
   *         example: 5
   *       - in: query
   *         name: stream
   *         required: false
   *         schema:
   *           type: string
   *           enum: ["true", "false"]
   *           default: "false"
   *         description: Set to false (default) for a JSON response. Set to true for a streamed text response (not supported in Swagger UI Try it out).
   *         example: "false"
   *     responses:
   *       200:
   *         description: |
   *           stream=false (default): JSON with the full generated answer.
   *           stream=true: text/plain stream of raw generated text chunks.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/RagGenerateResponse'
   *           text/plain:
   *             schema:
   *               type: string
   *       400:
   *         description: Missing or invalid parameters.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       401:
   *         description: Missing or invalid authentication token.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server misconfiguration (missing env vars).
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       502:
   *         description: Vector store or LLM service returned an error or is unreachable.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  route.post(
    "/generate",
    validateRequest({ body: ragBodySchema, query: ragQuerySchema }),
    asyncRoute(async (req, res) => {
      const {
        text,
        collectionId = "",
        systemPrompt,
        messages: messagesStr,
        temperature = 0.7,
        max_tokens = 1024,
        top_p = 0.65,
        frequency_penalty = 1.15,
        model,
        retrievalMethod,
        force_rag: force_rag_str,
        n_results = 5,
        stream: stream_str,
      } = req.query;

      const force_rag =
        force_rag_str === undefined
          ? true
          : force_rag_str !== "false" && force_rag_str !== "0";
      const stream = stream_str === "true";

      let historyMessages = [];
      if (messagesStr && messagesStr.trim()) {
        try {
          historyMessages = JSON.parse(messagesStr);
        } catch (_) {
          // ignore malformed JSON; treat as no history
        }
      }

      const indexerUrl = process.env.API_INDEXER;
      const elasticIndex = process.env.ELASTIC_INDEX;
      const llmUrl = process.env.API_LLM || "http://localhost:8000/v1";
      const llmApiKey = process.env.LLM_KEY || "dummy-key";
      const llmModel =
        model && model.trim()
          ? model
          : process.env.LLM_NAME || process.env.DEFAULT_MODEL || "phi4-mini";

      if (!indexerUrl || !elasticIndex) {
        return res
          .status(500)
          .json({ message: "Search service is not configured" });
      }

      // ── Step 1: Retrieve relevant document chunks (RAG) ──────────────────
      let contextStr = "";
      try {
        const chromaRes = await axios.post(
          `${indexerUrl}/chroma/collection/${elasticIndex}/query`,
          {
            query: text,
            collectionId: collectionId || undefined,
            retrievalMethod: retrievalMethod || undefined,
            force_rag,
          },
        );
        const docs = chromaRes.data || [];
        // Format context exactly as the frontend does in use-chat.ts
        contextStr = docs
          .slice(0, n_results)
          .map((d, i) => {
            const chunkText = (d.chunks || [])
              .map((c) => c.text || c.text_anonymized || "")
              .join(" ");
            const title = d.title || String(d.id || i + 1);
            return `<document id="DOC_${i + 1}" name="${title}">\nNome Documento ${title} - Contenuto: ${chunkText}\n</document>`;
          })
          .join("\n");
      } catch (err) {
        const status = err.response?.status;
        const message =
          err.response?.data?.detail?.[0]?.msg ||
          err.response?.data?.message ||
          err.message ||
          "Failed to retrieve context from vector store";
        return res.status(status || 502).json({ message });
      }

      // ── Step 2: Assemble messages ─────────────────────────────────────────
      const template =
        systemPrompt && systemPrompt.trim()
          ? systemPrompt
          : DEFAULT_SYSTEM_PROMPT;

      const filledSystemPrompt = template
        .replace("{{CONTEXT}}", contextStr)
        .replace("{{QUESTION}}", text);

      // Strip any incoming system messages and inject the newly built one first
      const filteredHistory = (historyMessages || []).filter(
        (m) => m.role !== "system",
      );

      const llmMessages = [
        { role: "system", content: filledSystemPrompt },
        ...filteredHistory,
        { role: "user", content: text },
      ];

      // ── Step 3: Call the LLM ──────────────────────────────────────────────
      const llmPayload = {
        model: llmModel,
        messages: llmMessages,
        temperature,
        max_tokens,
        top_p,
        frequency_penalty,
        stream,
      };

      const llmHeaders = {
        Authorization: `Bearer ${llmApiKey}`,
        "Content-Type": "application/json",
      };

      if (stream) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");

        try {
          const llmRes = await axios.post(
            `${llmUrl}/chat/completions`,
            llmPayload,
            { headers: llmHeaders, responseType: "stream" },
          );

          llmRes.data.on("data", (chunk) => {
            // The LLM returns OpenAI SSE lines: "data: {...}\n\n" or "data: [DONE]\n\n"
            const lines = chunk
              .toString()
              .split("\n")
              .filter((l) => l.trim());
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") {
                res.end();
                return;
              }
              try {
                const parsed = JSON.parse(payload);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) res.write(content);
              } catch (_) {
                // ignore malformed SSE chunks
              }
            }
          });

          llmRes.data.on("end", () => {
            if (!res.writableEnded) res.end();
          });
          llmRes.data.on("error", () => {
            if (!res.writableEnded) res.end();
          });
        } catch (err) {
          const status = err.response?.status;
          const message =
            err.response?.data?.error?.message ||
            err.response?.data?.message ||
            err.message ||
            "LLM service error";
          if (!res.headersSent) {
            return res.status(status || 502).json({ message });
          }
          res.end();
        }
      } else {
        // Non-streaming — suitable for Swagger UI "Try it out"
        try {
          const { data } = await axios.post(
            `${llmUrl}/chat/completions`,
            llmPayload,
            { headers: llmHeaders },
          );
          return res.json({
            content: data.choices?.[0]?.message?.content || "",
            model: data.model,
            usage: data.usage,
          });
        } catch (err) {
          const status = err.response?.status;
          const message =
            err.response?.data?.error?.message ||
            err.response?.data?.message ||
            err.message ||
            "LLM service error";
          return res.status(status || 502).json({ message });
        }
      }
    }),
  );
};
