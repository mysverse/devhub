// Discord bot client. Extracted from access-sync.ts, which owned the only
// copy of the fetch wrapper and used it purely for role sync — DevHub could
// change someone's roles but never say anything to them.
//
// Everything here fails soft and returns a boolean: Discord is a
// nice-to-have delivery channel, and a missing bot token, an unlinked
// account, or a closed DM must never break the flow that triggered the
// message.

const DISCORD_API = "https://discord.com/api/v10";

export function isDiscordConfigured() {
  return Boolean(process.env.DISCORD_BOT_TOKEN);
}

export async function discordFetch(path: string, options: RequestInit = {}) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not set");

  return fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${token}`,
      ...(options.headers as Record<string, string> | undefined),
    },
  });
}

export type DiscordMessage = {
  content: string;
  /** Optional deep link rendered as a second line. */
  url?: string | null;
};

function renderMessage(message: DiscordMessage) {
  return message.url ? `${message.content}\n${message.url}` : message.content;
}

/**
 * Open a DM channel with a user and post to it. Returns false rather than
 * throwing when Discord isn't configured, the user has no linked account, or
 * they have DMs closed — none of which are DevHub's problem to escalate.
 */
export async function sendDirectMessage(
  discordId: string | null | undefined,
  message: DiscordMessage,
): Promise<boolean> {
  if (!discordId || !isDiscordConfigured()) return false;

  try {
    const channelResponse = await discordFetch("/users/@me/channels", {
      method: "POST",
      body: JSON.stringify({ recipient_id: discordId }),
    });
    if (!channelResponse.ok) return false;

    const channel = (await channelResponse.json()) as { id?: string };
    if (!channel.id) return false;

    return await sendChannelMessage(channel.id, message);
  } catch {
    return false;
  }
}

/** Post to a known channel — announcements, not per-person delivery. */
export async function sendChannelMessage(
  channelId: string | null | undefined,
  message: DiscordMessage,
): Promise<boolean> {
  if (!channelId || !isDiscordConfigured()) return false;

  try {
    const response = await discordFetch(`/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: renderMessage(message) }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
