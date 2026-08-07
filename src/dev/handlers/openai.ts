/** Deterministic OpenAI Responses mock, including SSE streaming for chat. */

import { LINEAR_PROJECT, LINEAR_TEAM } from "@/dev/fixtures/linear";
import type { DevHandler } from "@/dev/intercept";
import { getDevState } from "@/dev/state";
import { buildReply } from "./anthropic";
import { CAR_PPT_PAYLOAD } from "./assistant-fixtures";

type ResponsesRequest = {
  model?: string;
  input?: unknown;
  instructions?: string;
  stream?: boolean;
  text?: { format?: { schema?: Record<string, unknown> } };
  tools?: Array<{ name?: string }>;
};

const SDK_ONLY_INPUT_FIELDS = new Set(["parsed", "parsed_arguments"]);

function sdkOnlyInputField(value: unknown, path = "input"): string | null {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = sdkOnlyInputField(item, `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, item] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (SDK_ONLY_INPUT_FIELDS.has(key)) return childPath;
    const found = sdkOnlyInputField(item, childPath);
    if (found) return found;
  }
  return null;
}

function inputText(input: unknown): string {
  if (typeof input === "string") return input;
  if (!Array.isArray(input)) return "";
  return input
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as Record<string, unknown>;
      if (typeof row.content === "string") return row.content;
      if (typeof row.output === "string") return row.output;
      return "";
    })
    .join("\n");
}

function latestUserText(input: unknown) {
  if (!Array.isArray(input)) return typeof input === "string" ? input : "";
  for (const item of [...input].reverse()) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.role === "user" && typeof row.content === "string") {
      return row.content;
    }
  }
  return "";
}

function baseResponse(id: string, body: ResponsesRequest) {
  return {
    id,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    background: false,
    error: null,
    incomplete_details: null,
    instructions: body.instructions ?? null,
    max_output_tokens: 2_500,
    model: body.model ?? "gpt-5.6-luna",
    output: [] as unknown[],
    parallel_tool_calls: false,
    previous_response_id: null,
    reasoning: { effort: "low", summary: null },
    service_tier: "default",
    store: false,
    temperature: null,
    text: body.text ?? { format: { type: "text" }, verbosity: "medium" },
    tool_choice: "auto",
    tools: body.tools ?? [],
    top_logprobs: 0,
    top_p: null,
    truncation: "disabled",
    usage: {
      input_tokens: 24,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 18,
      output_tokens_details: { reasoning_tokens: 2 },
      total_tokens: 42,
    },
  };
}

function textItem(id: string, text: string) {
  return {
    id: `msg_${id}`,
    type: "message",
    status: "completed",
    role: "assistant",
    content: [
      {
        type: "output_text",
        annotations: [],
        logprobs: [],
        text,
      },
    ],
  };
}

function toolRequest(body: ResponsesRequest) {
  const text = inputText(body.input).toLowerCase();
  const latestUser = latestUserText(body.input).trim().toLowerCase();
  const resultCount = Array.isArray(body.input)
    ? body.input.filter(
        (item) =>
          item &&
          typeof item === "object" &&
          (item as { type?: string }).type === "function_call_output",
      ).length
    : 0;
  const carIdea = /(?:proton x90|civilian car|car for lebuhraya)/.test(text);
  const hasDueDate = /(?:2026-08-31|august 31|end of (?:this|the) month)/.test(
    text,
  );
  const hasEstimate =
    /(?:estimate|level|complexity)\s*(?:is|of|:)?\s*3\b/.test(text) ||
    latestUser === "3";
  if (carIdea && hasDueDate && hasEstimate) {
    if (resultCount === 0) {
      return {
        name: "resolve_task_destination",
        arguments: { query: "Lebuhraya" },
      };
    }
    if (resultCount === 1) {
      return {
        name: "propose_ppt_request",
        arguments: CAR_PPT_PAYLOAD,
      };
    }
    return null;
  }
  if (/prepare an ordinary task/.test(text)) {
    if (resultCount === 0) return { name: "list_teams", arguments: {} };
    if (resultCount === 1) {
      return {
        name: "propose_create_task",
        arguments: {
          title: "Audit spawn points",
          description:
            "List every spawn point and flag duplicate names or missing team assignments.",
          teamId: LINEAR_TEAM.id,
          projectId: LINEAR_PROJECT.id,
          dueDate: null,
        },
      };
    }
    return null;
  }
  if (/sumaya|bandaraya|lebuhraya|wiki|improvement/i.test(text)) {
    if (resultCount === 0) {
      return {
        name: "search_game_wiki",
        arguments: { query: "sumaya", game: "sumaya" },
      };
    }
    if (resultCount === 1) {
      return {
        name: "get_game_wiki_article",
        arguments: { slug: "sumaya/jobs-fishing" },
      };
    }
    return null;
  }
  if (resultCount > 0) return null;
  if (/\bmys-201\b|find (?:a )?task|search tasks?/.test(text)) {
    return { name: "search_tasks", arguments: { query: "MYS-201" } };
  }
  if (/assigned|my tasks|working on/.test(text)) {
    return { name: "list_my_tasks", arguments: {} };
  }
  if (/open ppt|claim/.test(text)) {
    return { name: "list_open_ppts", arguments: {} };
  }
  if (/proof|progress/.test(text)) {
    return { name: "get_devhub_help", arguments: { topic: "proof" } };
  }
  return null;
}

function chatText(body: ResponsesRequest) {
  const text = inputText(body.input);
  const hasToolOutput =
    Array.isArray(body.input) &&
    body.input.some(
      (item) =>
        item &&
        typeof item === "object" &&
        (item as { type?: string }).type === "function_call_output",
    );
  if (hasToolOutput) {
    if (/proton x90|civilian car|car for lebuhraya/i.test(text)) {
      return "Your PPT request is ready to review below. Check the scope, estimate, and due date, then confirm when it looks right.";
    }
    if (/sumaya|bandaraya|lebuhraya|wiki|improvement/i.test(text)) {
      return "Based on the official Sumaya wiki documentation, here are key improvement areas for Sumaya:\n\n1. **Civilian Careers (Fishing & Palm Oil)**: Add more fish species, processing equipment, and balanced payout tiers.\n2. **Housing & Property Plots**: Improve plot customization UI and furniture placement controls.\n3. **Quests & Progression**: Introduce daily career milestones and team contract goals.\n\nTell me which area you want to develop and I can prepare a task draft or PPT request for you.";
    }
    return "I checked the current DevHub data. The results above are the source of truth; tell me which item you want to develop or act on.";
  }
  if (/make this a ppt|enough (?:to make|for) a ppt/i.test(text)) {
    return "Almost. Send the **due date + estimate (1–5)** in one reply. I’ll use the draft’s existing scope and prepare the review card—no more setup questions.";
  }
  if (/proton x90|civilian car|car for lebuhraya/i.test(text)) {
    return "**Working draft**\n\n**Create one realistic civilian car for Lebuhraya**\n\n- Roblox-ready Proton X90-inspired SUV\n- Realistic exterior with a basic interior\n- Correct scale, materials, pivots, and organized model\n- Driving physics and animations stay out of scope\n\n**Done when:** it imports cleanly, looks complete from all sides, and is optimized for later vehicle setup.\n\nI assumed one finished car variant. You can make this a PPT now or change the scope.";
  }
  if (/diagram|flow/i.test(text)) {
    return "Here’s the short version.\n\n```mermaid\nflowchart LR\n  Idea --> Scope\n  Scope --> Review\n  Review --> Done\n```\n\nStart by naming the outcome you want.";
  }
  return "Let's shape that into a useful task. What outcome should be visible when it is done, and is there a due date or dependency I should account for? (Dev-mode canned reply.)";
}

function sse(events: unknown[]) {
  return new Response(
    `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`,
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

function streamingResponse(id: string, body: ResponsesRequest) {
  const response = baseResponse(id, body);
  const call = toolRequest(body);
  if (call) {
    const item = {
      id: `fc_${id}`,
      type: "function_call",
      status: "completed",
      call_id: `call_${id}`,
      name: call.name,
      arguments: JSON.stringify(call.arguments),
    };
    response.output = [item];
    return sse([
      {
        type: "response.created",
        sequence_number: 0,
        response: { ...response, status: "in_progress", output: [] },
      },
      {
        type: "response.output_item.added",
        sequence_number: 1,
        output_index: 0,
        item: { ...item, status: "in_progress", arguments: "" },
      },
      {
        type: "response.function_call_arguments.done",
        sequence_number: 2,
        response_id: id,
        output_index: 0,
        item_id: item.id,
        name: item.name,
        arguments: item.arguments,
      },
      {
        type: "response.output_item.done",
        sequence_number: 3,
        output_index: 0,
        item,
      },
      { type: "response.completed", sequence_number: 4, response },
    ]);
  }

  const text = chatText(body);
  const item = textItem(id, text);
  response.output = [item];
  const emptyItem = { ...item, status: "in_progress", content: [] };
  const emptyPart = {
    type: "output_text",
    annotations: [],
    logprobs: [],
    text: "",
  };
  const part = item.content[0];
  return sse([
    {
      type: "response.created",
      sequence_number: 0,
      response: { ...response, status: "in_progress", output: [] },
    },
    {
      type: "response.output_item.added",
      sequence_number: 1,
      output_index: 0,
      item: emptyItem,
    },
    {
      type: "response.content_part.added",
      sequence_number: 2,
      response_id: id,
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      part: emptyPart,
    },
    {
      type: "response.output_text.delta",
      sequence_number: 3,
      response_id: id,
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      logprobs: [],
      delta: text,
    },
    {
      type: "response.output_text.done",
      sequence_number: 4,
      response_id: id,
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      logprobs: [],
      text,
    },
    {
      type: "response.content_part.done",
      sequence_number: 5,
      response_id: id,
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      part,
    },
    {
      type: "response.output_item.done",
      sequence_number: 6,
      output_index: 0,
      item,
    },
    { type: "response.completed", sequence_number: 7, response },
  ]);
}

export const handleOpenAi: DevHandler = async (req, url) => {
  if (url.pathname !== "/v1/responses" || req.method !== "POST") {
    throw new Error(
      `[dev-mode] Mock OpenAI: unhandled ${req.method} ${url.pathname}. Add it in src/dev/handlers/openai.ts`,
    );
  }
  const body = (await req.json()) as ResponsesRequest;
  const invalidField = sdkOnlyInputField(body.input);
  if (invalidField) {
    return Response.json(
      {
        error: {
          message: `Unknown parameter: '${invalidField}'.`,
          type: "invalid_request_error",
          param: invalidField,
          code: "unknown_parameter",
        },
      },
      { status: 400 },
    );
  }
  if (body.stream && /test fallback/i.test(inputText(body.input))) {
    return Response.json(
      {
        error: {
          message: "Dev-mode forced OpenAI contract failure.",
          type: "invalid_request_error",
          param: "input",
          code: "invalid_request",
        },
      },
      { status: 400 },
    );
  }
  const id = `resp_dev_${++getDevState().counters.llm}`;
  console.log(`[dev-mode] openai → canned Responses reply (${id})`);
  if (body.stream) return streamingResponse(id, body);

  const schema = body.text?.format?.schema;
  const reply = schema
    ? buildReply({
        messages: [{ role: "user", content: inputText(body.input) }],
        output_config: { format: { schema } },
      })
    : { message: chatText(body) };
  const response = baseResponse(id, body);
  response.output = [textItem(id, JSON.stringify(reply))];
  return Response.json(response);
};
