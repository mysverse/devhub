import { NextResponse } from "next/server";
import {
  createAssistantConversation,
  listAssistantConversations,
} from "@/lib/assistant";
import { getSession } from "@/lib/auth-utils";
import { isAssistantConfigured } from "@/lib/llm";

export async function GET(request: Request) {
  const { userId } = await getSession();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const archived = new URL(request.url).searchParams.get("archived") === "true";
  const conversations = await listAssistantConversations(userId, archived);
  return NextResponse.json({
    conversations,
    available: isAssistantConfigured(),
  });
}

export async function POST(request: Request) {
  const { userId } = await getSession();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAssistantConfigured()) {
    return NextResponse.json(
      { error: "The assistant is not configured." },
      { status: 503 },
    );
  }
  let entryPoint: string | null = null;
  try {
    const body = (await request.json()) as { entryPoint?: string };
    if (typeof body?.entryPoint === "string") entryPoint = body.entryPoint;
  } catch {
    // Empty POST body is allowed
  }
  const conversation = await createAssistantConversation(userId, entryPoint);
  return NextResponse.json({ conversation }, { status: 201 });
}
