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

export interface PublicUser {
  id: string | null;
  userId: string;
  username: string;
  displayName: string | null;
  avatarHash: string | null;
}

export type AuthenticatedUser = Omit<
  User,
  "refreshToken" | "accessToken" | "tokenExpires"
>;

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
