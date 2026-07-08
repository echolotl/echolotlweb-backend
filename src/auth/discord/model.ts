export const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
export const MIN_DISCORD_ACCOUNT_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface User {
  id: string;
  userId: string;
  username: string;
  displayName: string | null;
  avatarHash: string | null;
  anonymous: boolean;
  createdAt: number;
  refreshToken: string;
  accessToken: string | null;
  tokenExpires: number | null;
  updatedAt: number;
}

/**
 * The subset of a user's fields that are safe to expose publicly.
 * The only thing identifying Discord thing is the username,
 * but if the user has enabled anonymous mode, that is replaced with a generic one.
 */
export interface PublicUser {
  userId: string;
  username: string;
  displayName: string | null;
  avatarHash: string | null;
}

export function toPublicUser(user: User): PublicUser {
  if (user.anonymous) {
    return {
      userId: user.userId,
      username: `anonymous${user.userId.slice(0, 4)}`,
      displayName: "Anonymous",
      avatarHash: null,
    };
  }

  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    avatarHash: user.avatarHash,
  };
}

export type AuthenticatedUser = Omit<
  User,
  "refreshToken" | "accessToken" | "tokenExpires"
>;

export function toAuthenticatedUser(user: User): AuthenticatedUser {
  const { refreshToken, accessToken, tokenExpires, ...authenticatedUser } =
    user;
  return authenticatedUser;
}

export interface Session {
  token: string;
  id: string;
  createdAt: number;
  expiresAt: number;
}

export interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface DiscordUserResponse {
  id: string;
  username: string;
  discriminator: string;
  global_name: string | null;
  avatar: string | null;
  bot?: boolean;
  system?: boolean;
  mfa_enabled?: boolean;
  banner?: string | null;
  accent_color?: number | null;
  locale: string;
  flags: number;
  public_flags: number;
  avatar_decoration_data?: any;
  collectibles?: any;
  primary_guild?: any;
}
