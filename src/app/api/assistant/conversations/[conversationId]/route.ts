import { NextResponse } from "next/server";
import {
  deleteAssistantConversation,
  getAssistantConversation,
  updateAssistantConversation,
} from "@/lib/assistant";
import { getSession } from "@/lib/auth-utils";

type Params = Promise<{ conversationId: string }>;

export async function GET(_request: Request, { params }: { params: Params }) {
  const { userId } = await getSession();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { conversationId } = await params;
  const conversation = await getAssistantConversation(userId, conversationId);
  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 },
    );
  }
  return NextResponse.json({ conversation });
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  const { userId } = await getSession();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { conversationId } = await params;
  let body: { title?: unknown; archived?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  try {
    const found = await updateAssistantConversation(userId, conversationId, {
      ...(typeof body.title === "string" ? { title: body.title } : {}),
      ...(typeof body.archived === "boolean"
        ? { archived: body.archived }
        : {}),
    });
    if (!found) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Params },
) {
  const { userId } = await getSession();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { conversationId } = await params;
  const found = await deleteAssistantConversation(userId, conversationId);
  if (!found) {
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true });
}
