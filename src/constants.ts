export const ALLOWED_ORIGINS = [
  "https://echolotl.lol",
  "https://www.echolotl.lol",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

export const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://echolotl.lol";
export const MIN_DISCORD_ACCOUNT_AGE_DAYS = 30;
export const MIN_DISCORD_ACCOUNT_AGE_MS =
  MIN_DISCORD_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000;

export const STATUS_PASSKEY = process.env.PASSKEY;
