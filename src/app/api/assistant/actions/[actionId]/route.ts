import { NextResponse } from "next/server";
import { getAssistantActionDto } from "@/lib/assistant";
import {
  cancelAssistantAction,
  confirmAssistantAction,
  updateAssistantAction,
} from "@/lib/assistant-actions";
import { getSession } from "@/lib/auth-utils";

type Params = Promise<{ actionId: string }>;

export async function POST(request: Request, { params }: { params: Params }) {
  const { userId } = await getSession();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { decision?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (body.decision !== "confirm" && body.decision !== "cancel") {
    return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  }
  const { actionId } = await params;
  const result =
    body.decision === "confirm"
      ? await confirmAssistantAction(actionId, userId)
      : await cancelAssistantAction(actionId, userId);
  const action = await getAssistantActionDto(userId, actionId);
  if (!action) {
    return NextResponse.json({ error: "Action not found." }, { status: 404 });
  }
  return NextResponse.json(
    { ...result, action },
    { status: "error" in result && result.error ? 400 : 200 },
  );
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  const { userId } = await getSession();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let patchPayload: Record<string, unknown>;
  try {
    patchPayload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { actionId } = await params;
  const result = await updateAssistantAction(actionId, userId, patchPayload);

  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result, { status: 200 });
}
