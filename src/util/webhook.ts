const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

export interface DiscordWebhook {
  content: string;
  username?: string;
  avatar_url?: string;
  tts?: boolean;
  embeds?: DiscordWebhookEmbed[];
}

export interface DiscordWebhookEmbed {
  title?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  author?: {
    name?: string;
    url?: string;
    icon_url?: string;
  };
}

export const sendDiscordWebhook = async (
  payload: DiscordWebhook,
): Promise<void> => {
  if (!DISCORD_WEBHOOK_URL) {
    throw new Error("DISCORD_WEBHOOK_URL is not defined");
  }
  if (!payload.username) {
    payload.username = "backend.echolotl.lol";
  }
  // also add a placeholder avatar if not provided
  await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
};
