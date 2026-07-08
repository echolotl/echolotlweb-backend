import {
  upsertSession,
  destroySession as removeSession,
  storeUser,
} from "../../db";
import { Logger } from "../../util/logger";
import {
  DISCORD_TOKEN_URL,
  type DiscordTokenResponse,
  type User,
} from "./model";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;

const discordLogger = Logger.fmtPackage("DISCORD");

const DISCORD_EPOCH_MS = 1420070400000n;

export function getDiscordAccountCreatedAt(discordId: string): number {
  const snowflake = BigInt(discordId);
  const timestampMs = (snowflake >> 22n) + DISCORD_EPOCH_MS;
  return Number(timestampMs);
}

export async function createSession(discordId: string): Promise<string> {
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = Buffer.from(tokenBytes).toString("hex");

  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  upsertSession({
    token,
    id: discordId,
    createdAt: now,
    expiresAt,
  });

  return token;
}

export async function destroySession(token: string): Promise<void> {
  removeSession(token);
}

export async function refreshDiscordToken(user: User): Promise<User> {
  const response = await fetch(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: user.refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    Logger.error(
      `${discordLogger}Failed to refresh Discord token for ${user.id}: ${errorText}`,
    );
    throw new Error(`Failed to refresh Discord token: ${response.statusText}`);
  }

  const tokenData: DiscordTokenResponse = await response.json();
  const expiresAt = Date.now() + tokenData.expires_in * 1000;

  const updatedUser: User = {
    ...user,
    refreshToken: tokenData.refresh_token,
    accessToken: tokenData.access_token,
    tokenExpires: expiresAt,
    updatedAt: Date.now(),
  };

  storeUser(updatedUser);

  Logger.success(
    `${discordLogger}Successfully refreshed Discord token for ${user.id}`,
  );

  return updatedUser;
}

export async function ensureFreshDiscordToken(user: User): Promise<User> {
  if (user.tokenExpires && user.tokenExpires > Date.now()) {
    return user;
  }

  return refreshDiscordToken(user);
}
