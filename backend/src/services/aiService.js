const pool = require("../db/pool");
const pageService = require("./pageService");

const GEMINI_MODEL = "gemini-3-flash-preview";
const CLAUDE_MODEL = process.env.AI_MODEL || "claude-sonnet-4-5";
const MAX_PAGE_BYTES = 200_000;
const MAX_CATALOG_BYTES = 30_000;
const OPERATION_NAMES = ["update_props", "set_variant", "add_block", "remove_block", "move_block", "update_theme", "apply_preset"];

// AI는 페이지 전체를 다시 쓰지 않고 작은 수정 단위(operations)만 제안한다.
// 검증과 적용은 에디터(src/lib/site-ops.ts)가 하고, 고객이 미리보기를 보고 적용한다.
function buildInstruction(catalog) {
  const blocks = Array.isArray(catalog?.blocks) ? catalog.blocks : [];
  const presets = Array.isArray(catalog?.presets) ? catalog.presets : [];
  const blockLines = blocks
    .map((b) => `- ${b.type} (variants: ${(b.variants || []).join(", ")}): ${b.description || ""}. Default props: ${JSON.stringify(b.defaultProps || {})}`)
    .join("\n");

  return `You are the editing assistant inside a no-code website builder. The people talking to you are small-business owners editing their own homepage; most are not technical and write in Korean.

The website is JSON: a page is an ordered list of blocks ({id, type, variant, props}) plus a theme. You change it only with small operations. The customer sees a preview of your operations and decides whether to apply them, so propose exactly what they asked for and nothing extra.

## Block catalog
${blockLines}

Theme presets: ${presets.map((p) => `${p.id} (${p.name})`).join(", ")}.
Theme fields: bg0-bg5, text0-text3, accent, accentDim, borderDefault, borderSubtle, borderHover (hex like #22c55e), fontSans, fontDisplay, fontMono (Google Font names), radius (0-24), radiusLg (0-32).

## Operations
- {op:"update_props", blockId, props}: merge props into an existing block. For list props (items, links, tiers, members, images) send the complete new list.
- {op:"set_variant", blockId, variant}: switch an existing block's layout to one of its listed variants.
- {op:"add_block", type, variant?, props?, afterBlockId?}: add a block; omit afterBlockId to place it before the footer. Fill props with real copy suited to the business, not placeholders.
- {op:"remove_block", blockId}, {op:"move_block", blockId, toIndex} (toIndex is 0-based in the final order).
- {op:"update_theme", theme}: change some theme fields. {op:"apply_preset", presetId}: replace the whole theme with a preset.

## How to respond
- Use block ids exactly as they appear in the current page. If the customer says "this" or "here", they mean the selected block when one is given.
- Write new copy in the same language as the existing site content unless asked otherwise.
- If the request is ambiguous, cannot be done with these blocks (online payments, booking, custom code), or is just a question, return no operations and answer in reply, suggesting the closest thing you can do.
- reply and summary are Korean, one or two short friendly sentences, without technical words like JSON, props or variant. Nothing is applied until the customer approves, so describe changes as proposals ("~로 바꿔 드릴게요"), not as already done.`;
}

function buildUserContent(page, selectedBlockId, prompt) {
  return `Current page:\n${JSON.stringify(page)}\n\nSelected block: ${selectedBlockId || "none"}\n\nCustomer request:\n${prompt}`;
}

function normalizeProposal(raw) {
  const operations = Array.isArray(raw?.operations) ? raw.operations : [];
  const summary = typeof raw?.summary === "string" ? raw.summary.trim() : "";
  const reply = typeof raw?.reply === "string" ? raw.reply.trim() : "";
  return { reply: reply || summary, summary, operations };
}

function parseJsonText(text) {
  const trimmed = String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/, "");
  return JSON.parse(trimmed);
}

async function recordUsage(userId, pageId, prompt, provider, status) {
  await pool.query(
    "INSERT INTO ai_usage (user_id, page_id, prompt, provider, status) VALUES (?, ?, ?, ?, ?)",
    [userId, pageId, String(prompt).slice(0, 2000), provider, status]
  );
}

async function listUsage(userId) {
  const [rows] = await pool.query(
    "SELECT id, page_id, prompt, provider, status, created_at FROM ai_usage WHERE user_id = ? ORDER BY id DESC LIMIT 50",
    [userId]
  );

  return rows.map((row) => ({
    id: row.id,
    pageId: row.page_id,
    prompt: row.prompt,
    provider: row.provider,
    status: row.status,
    createdAt: row.created_at,
  }));
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

async function callGemini(instruction, userContent, signal) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.AI_API_KEY}`,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: `${instruction}\n\nReturn only a JSON object: {"reply": string, "summary": string, "operations": array}.`,
          }],
        },
        contents: [{ role: "user", parts: [{ text: userContent }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Empty Gemini response");
  }

  return normalizeProposal(parseJsonText(text));
}

const EDIT_TOOL = {
  name: "propose_site_edits",
  description: "Propose a set of edits to the current page. The customer reviews them before they are applied.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "One short Korean sentence telling the customer what will change." },
      operations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: OPERATION_NAMES },
            blockId: { type: "string" },
            props: { type: "object" },
            variant: { type: "string" },
            type: { type: "string" },
            afterBlockId: { type: "string" },
            toIndex: { type: "integer" },
            theme: { type: "object" },
            presetId: { type: "string" },
          },
          required: ["op"],
        },
      },
    },
    required: ["summary", "operations"],
  },
};

async function callClaude(instruction, userContent, signal) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.AI_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      system: instruction,
      tools: [EDIT_TOOL],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  let reply = "";
  let input = null;
  for (const part of data.content || []) {
    if (part.type === "text") reply += part.text;
    if (part.type === "tool_use" && part.name === EDIT_TOOL.name) input = part.input;
  }
  if (!reply.trim() && !input) {
    throw new Error("Empty Claude response");
  }

  return normalizeProposal({ ...(input || {}), reply });
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

async function proposeEdits(userId, pageId, { prompt, page, selectedBlockId, catalog }, signal) {
  const saved = await pageService.getPage(userId, pageId);
  if (!saved) {
    return null;
  }

  if (!page || !Array.isArray(page.blocks) || Buffer.byteLength(JSON.stringify(page), "utf8") > MAX_PAGE_BYTES) {
    throw badRequest("페이지 내용이 올바르지 않거나 너무 큽니다.");
  }
  if (Buffer.byteLength(JSON.stringify(catalog || {}), "utf8") > MAX_CATALOG_BYTES) {
    throw badRequest("블록 목록이 너무 큽니다.");
  }

  const provider = process.env.AI_PROVIDER || "claude";
  if (!process.env.AI_API_KEY) {
    await recordUsage(userId, saved.id, prompt, provider, "no_key");
    const error = new Error("AI_API_KEY가 설정되지 않았습니다.");
    error.status = 503;
    throw error;
  }

  const instruction = buildInstruction(catalog);
  const userContent = buildUserContent(page, typeof selectedBlockId === "string" ? selectedBlockId : null, prompt);

  try {
    const proposal = provider === "gemini"
      ? await callGemini(instruction, userContent, signal)
      : await callClaude(instruction, userContent, signal);
    if (signal?.aborted) {
      const error = new Error("Aborted");
      error.name = "AbortError";
      throw error;
    }
    await recordUsage(userId, saved.id, prompt, provider, "success");
    return proposal;
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      throw abortError;
    }
    await recordUsage(userId, saved.id, prompt, provider, "failed");
    throw error;
  }
}

module.exports = {
  proposeEdits,
  listUsage,
};
