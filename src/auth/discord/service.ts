import {
  upsertSession,
  destroySession as removeSession,
  storeUser,
} from "../../db";
import { Logger } from "../../util/logger";
import { sendDiscordWebhook } from "../../util/webhook";
import {
  AuthenticatedUser,
  DISCORD_TOKEN_URL,
  PublicUser,
  type DiscordTokenResponse,
  type DiscordUserResponse,
  type User,
} from "./model";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PROFILE_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

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

export async function fetchDiscordProfile(
  accessToken: string,
): Promise<DiscordUserResponse> {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch Discord profile: ${response.statusText} - ${errorText}`,
    );
  }

  return response.json();
}

export async function refreshDiscordToken(user: User): Promise<User> {
  const response = await fetch(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
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

  let profile: DiscordUserResponse | null = null;
  try {
    profile = await fetchDiscordProfile(tokenData.access_token);
  } catch (error) {
    Logger.warning(
      `${discordLogger}Failed to refresh Discord profile for ${user.id} during token refresh: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const updatedUser: User = {
    ...user,
    ...(profile
      ? {
          username: profile.username,
          displayName: profile.global_name,
          avatarHash: profile.avatar,
        }
      : {}),
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

export async function refreshDiscordProfile(user: User): Promise<User> {
  if (!user.accessToken) {
    return user;
  }

  try {
    const profile = await fetchDiscordProfile(user.accessToken);

    const updatedUser: User = {
      ...user,
      username: profile.username,
      displayName: profile.global_name,
      avatarHash: profile.avatar,
      updatedAt: Date.now(),
    };

    storeUser(updatedUser);

    Logger.success(
      `${discordLogger}Successfully refreshed Discord profile for ${user.id}`,
    );

    return updatedUser;
  } catch (error) {
    Logger.warning(
      `${discordLogger}Failed to refresh Discord profile for ${user.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return user;
  }
}

export function getAvatarUrl(user: User, size: number = 128): string | null {
  if (!user.avatarHash) {
    return null;
  }
  if (user.avatarHash.startsWith("a_")) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatarHash}.webp?animated=true&size=${size}`;
  }
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatarHash}.webp?size=${size}`;
}

export function toAuthenticatedUser(user: User): AuthenticatedUser {
  const { refreshToken, accessToken, tokenExpires, ...authenticatedUser } =
    user;
  return authenticatedUser;
}

export function toPublicUser(user: User): PublicUser {
  if (user.anonymous) {
    return {
      id: null,
      userId: user.userId,
      username: `anonymous${user.userId.slice(0, 4)}`,
      displayName: "Anonymous",
      avatarHash: null,
    };
  }

  return {
    id: user.id,
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    avatarHash: user.avatarHash,
  };
}

export async function notifyAccountCreated(user: User): Promise<void> {
  try {
    await sendDiscordWebhook({
      content: "New account created",
      embeds: [
        {
          description: `${user.username} (${user.userId})`,
          timestamp: new Date(user.createdAt).toISOString(),
          color: 0x00ff00,
          author: {
            name: user.username,
            icon_url: getAvatarUrl(user) ?? undefined,
          },
        },
      ],
    });
  } catch (error) {
    Logger.warning(
      `${discordLogger}Failed to send account created webhook: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function notifyAccountDeleted(user: User): Promise<void> {
  try {
    await sendDiscordWebhook({
      content: "Account deleted",
      embeds: [
        {
          description: `${user.username} (${user.userId})`,
          timestamp: new Date().toISOString(),
          color: 0xff0000,
          author: {
            name: user.username,
            icon_url: getAvatarUrl(user) ?? undefined,
          },
        },
      ],
    });
  } catch (error) {
    Logger.warning(
      `${discordLogger}Failed to send account deleted webhook: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
