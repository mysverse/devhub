export type AssistantPreview = {
  title: string;
  description: string;
  warning?: string;
};

export type AssistantActionDto = {
  id: string;
  kind: string;
  payload: unknown;
  preview: AssistantPreview;
  status:
    | "PENDING"
    | "EXECUTING"
    | "SUCCEEDED"
    | "FAILED"
    | "CANCELLED"
    | "EXPIRED";
  expiresAt: string;
  executedAt: string | null;
  result: unknown;
  error: string | null;
};

export type AssistantLinearIssueReference = {
  kind: "linear_issue";
  id: string;
  identifier: string;
  title: string;
  url: string;
  description: string | null;
  estimate: number | null;
  stateName: string;
  labelNames: string[];
  imageUrl: string | null;
};

export type AssistantReferenceDto = AssistantLinearIssueReference;

export type AssistantMessageDto = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "PENDING" | "COMPLETE" | "INTERRUPTED" | "FAILED";
  provider: string | null;
  model: string | null;
  createdAt: string;
  actions: AssistantActionDto[];
  references: AssistantReferenceDto[];
};

export type AssistantConversationSummary = {
  id: string;
  title: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssistantConversationDto = AssistantConversationSummary & {
  messages: AssistantMessageDto[];
};

export type AssistantStreamEvent =
  | {
      type: "start";
      userMessage: AssistantMessageDto;
      message: AssistantMessageDto;
    }
  | { type: "delta"; delta: string }
  | { type: "action"; action: AssistantActionDto }
  | { type: "references"; references: AssistantReferenceDto[] }
  | { type: "provider"; provider: string; model: string }
  | {
      type: "tool";
      toolCallId: string;
      name: string;
      phase: "running" | "complete" | "error";
      label: string;
      detail?: string;
    }
  | { type: "done"; message: AssistantMessageDto }
  | { type: "error"; error: string; message?: AssistantMessageDto };
