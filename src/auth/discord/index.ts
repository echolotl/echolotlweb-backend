import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { Logger } from "../../util/logger";
import {
  DiscordUserResponse,
  type DiscordTokenResponse,
  MIN_DISCORD_ACCOUNT_AGE_MS,
} from "./model";
import {
  deleteUser,
  getUserById,
  getUserByUserId,
  sessionsByUserId,
  setUserAnonymous,
  storeUser,
  userBySession,
} from "../../db";
import {
  createSession,
  destroySession,
  ensureFreshDiscordToken,
  getDiscordAccountCreatedAt,
  SESSION_TTL_MS,
  toAuthenticatedUser,
  toPublicUser,
} from "./service";
import { FRONTEND_URL } from "../../constants";

function getDiscordOAuthEnv(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing Discord OAuth env vars. Required: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI.",
    );
  }

  return { clientId, clientSecret, redirectUri };
}

export const discordRouter = new Elysia({ prefix: "/discord" })
  .use(rateLimit({ duration: 60_000, max: 20, scoping: "scoped" }))
  .get("/", ({ cookie: { oauth_state }, redirect, set }) => {
    let oauth;
    try {
      oauth = getDiscordOAuthEnv();
    } catch (error) {
      set.status = 500;
      Logger.error(`Discord OAuth config error: ${error}`);
      return { error: "Discord OAuth is not configured on the server." };
    }

    const state = crypto.randomUUID();
    oauth_state.set({
      value: state,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    const params = new URLSearchParams({
      client_id: oauth.clientId,
      redirect_uri: oauth.redirectUri,
      response_type: "code",
      scope: "identify",
      state,
    });

    return redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  })
  .get(
    "/authenticate",
    async ({ query, cookie: { oauth_state, session }, redirect, set }) => {
      let oauth;
      try {
        oauth = getDiscordOAuthEnv();
      } catch (error) {
        set.status = 500;
        Logger.error(`Discord OAuth config error: ${error}`);
        return { error: "Discord OAuth is not configured on the server." };
      }

      const { code, state } = query;

      if (!state || state != oauth_state.value) {
        set.status = 400;
        return { error: "Invalid state provided." };
      }
      oauth_state.remove();

      if (!code) {
        set.status = 400;
        return { error: "Missing authorization code." };
      }

      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: oauth.clientId,
          client_secret: oauth.clientSecret,
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: oauth.redirectUri,
        }),
      });
      if (!tokenRes.ok) {
        set.status = 502;
        return { error: "Failed to exchange code with Discord" };
      }

      const tokenData: DiscordTokenResponse = await tokenRes.json();
      const expiresAt = Date.now() + tokenData.expires_in * 1000;

      const userRes = await fetch("https://discord.com/api/users/@me", {
        headers: {
          Authorization: `${tokenData.token_type} ${tokenData.access_token}`,
        },
      });
      if (!userRes.ok) {
        set.status = 502;
        return { error: "Failed to fetch user info from Discord" };
      }

      const user: DiscordUserResponse = await userRes.json();
      Logger.dim(`Discord login: ${user.username} (${user.id})`);

      const accountCreatedAt = getDiscordAccountCreatedAt(user.id);
      const accountAgeMs = Date.now() - accountCreatedAt;
      if (accountAgeMs < MIN_DISCORD_ACCOUNT_AGE_MS) {
        set.status = 403;
        return {
          error:
            "Your Discord account does not meet the minimum age requirement to sign in.",
        };
      }

      const existingUser = getUserById(user.id);

      storeUser({
        id: user.id,
        userId: existingUser?.userId ?? crypto.randomUUID(),
        username: user.username,
        displayName: user.global_name,
        avatarHash: user.avatar,
        anonymous: existingUser?.anonymous ?? false,
        refreshToken: tokenData.refresh_token,
        accessToken: tokenData.access_token,
        tokenExpires: expiresAt,
        updatedAt: Date.now(),
      });

      const sessionToken = await createSession(user.id);
      session.set({
        value: sessionToken,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_MS / 1000,
      });

      return redirect(FRONTEND_URL);
    },
  )
  .get("/logout", async ({ cookie: { session } }) => {
    if (session.value) {
      await destroySession(session.value as string);
      session.remove();
    }
    return "Logged out successfully";
  })
  .get("/me", async ({ cookie: { session } }) => {
    const user = userBySession(session.value as string | undefined);
    if (!user) {
      return new Response(null, { status: 204 });
    }

    let freshUser = user;
    try {
      freshUser = await ensureFreshDiscordToken(user);
    } catch (error) {
      Logger.error(
        `Failed to refresh Discord token for ${user.id}, logging out: ${error}`,
      );
      await destroySession(session.value as string);
      session.remove();
      return new Response(null, { status: 204 });
    }

    return {
      user: toAuthenticatedUser(freshUser),
    };
  })
  .patch(
    "/me",
    async ({ cookie: { session }, body, set }) => {
      const user = userBySession(session.value as string | undefined);
      if (!user) {
        set.status = 401;
        return "Unauthorized";
      }

      const updatedUser = setUserAnonymous(user.id, body.anonymous);
      if (!updatedUser) {
        set.status = 404;
        return "User not found";
      }

      return { user: toAuthenticatedUser(updatedUser) };
    },
    {
      body: t.Object({
        anonymous: t.Boolean(),
      }),
    },
  )
  .delete("/me", async ({ cookie: { session }, set }) => {
    const user = userBySession(session.value as string | undefined);
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    const sessions = sessionsByUserId(user.userId);
    for (const s of sessions) {
      await destroySession(s.token);
    }
    deleteUser(user.id);
    return `User ${user.username} (${user.userId}) deleted successfully`;
  })
  .get("/user/:userId", ({ params, set }) => {
    const user = getUserByUserId(params.userId);
    if (!user) {
      set.status = 404;
      return "User not found";
    }

    return { user: toPublicUser(user) };
  });
