export type AssistantPrompt = {
  label: string;
  prompt: string;
  description: string;
  tone: "blue" | "cyan" | "grape" | "teal";
};

export const ASSISTANT_STARTERS: AssistantPrompt[] = [
  {
    label: "Shape an idea",
    prompt: "Help me turn a rough idea into a small, well-scoped task",
    description: "Turn a fuzzy thought into a clear next step.",
    tone: "grape",
  },
  {
    label: "Plan my next move",
    prompt: "What should I focus on next based on my active tasks?",
    description: "Review your current work and pick a focus.",
    tone: "blue",
  },
  {
    label: "Find paid work",
    prompt: "Show me open PPTs that I could claim",
    description: "Scan the board for available PPT tasks.",
    tone: "teal",
  },
  {
    label: "Unblock me",
    prompt: "Help me work out what is blocking my current task",
    description: "Untangle a blocker without a giant checklist.",
    tone: "cyan",
  },
];

const DEFAULT_QUICK_PROMPTS = [
  "What am I working on?",
  "Help me scope an idea",
  "Show open PPTs",
];

export function assistantPromptsForPath(pathname: string): string[] {
  if (pathname.startsWith("/dashboard/ppts")) {
    return [
      "Show open PPTs",
      "Check my PPT requests",
      "Explain proof in simple terms",
    ];
  }
  if (pathname.startsWith("/dashboard/bonuses")) {
    return [
      "Explain bonus eligibility",
      "Show my active tasks",
      "Help scope non-PPT work",
    ];
  }
  if (pathname.startsWith("/dashboard/transactions")) {
    return [
      "Explain payment statuses",
      "How do PPT payments work?",
      "Where can I find a payment slip?",
    ];
  }
  if (
    pathname.startsWith("/dashboard/settings") ||
    pathname.startsWith("/dashboard/notifications")
  ) {
    return [
      "Where are notification settings?",
      "Help me navigate HR settings",
      "What can I update here?",
    ];
  }
  if (pathname.startsWith("/dashboard/admin")) {
    return [
      "Find a task to review",
      "Help me suggest an open PPT",
      "Explain the safe assignment flow",
    ];
  }
  return DEFAULT_QUICK_PROMPTS;
}

export function assistantNudgeForPath(pathname: string) {
  if (pathname.startsWith("/dashboard/ppts")) {
    return "I can find an open PPT or explain your next step.";
  }
  if (pathname.startsWith("/dashboard/bonuses")) {
    return "Bonus rules feel dense. I can make them quick.";
  }
  if (pathname.startsWith("/dashboard/transactions")) {
    return "Not sure what a payment status means? Ask me.";
  }
  if (pathname.startsWith("/dashboard/admin")) {
    return "I can help review, assign, or suggest tasks safely.";
  }
  return "Stuck or starting something new? Let’s make it smaller.";
}
