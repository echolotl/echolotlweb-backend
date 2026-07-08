import { Elysia, t } from "elysia";
import cors from "@elysiajs/cors";
import { z } from "zod";
import { getStatus, setStatus, getStatuses } from "./service";
import { rateLimit } from "elysia-rate-limit";
import { ALLOWED_ORIGINS, STATUS_PASSKEY } from "../constants";

export const statusRouter = new Elysia({ prefix: "/status" })
  .use(
    cors({
      origin: ALLOWED_ORIGINS,
      credentials: true,
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )
  .use(
    rateLimit({
      duration: 120 * 1000,
      max: 15,
      errorResponse: "Rate limit exceeded",
      scoping: "scoped",
    }),
  )
  .get("/", () => {
    const status = getStatus();

    if (!status) {
      return new Response(null, { status: 204 });
    }

    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
  .get(
    "/history",
    ({ query }) => {
      const limit = query.limit || 10;
      const statuses = getStatuses(limit);
      const total = statuses.length;
      if (total === 0) {
        return new Response(null, { status: 204 });
      }
      const newJson = {
        total,
        statuses,
      };
      return new Response(JSON.stringify(newJson), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number()),
      }),
    },
  )
  .post(
    "/",
    ({ headers, body }) => {
      const authHeader = headers.authorization;
      const providedKey = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];

      if (!STATUS_PASSKEY) {
        return new Response("Server passkey not set", {
          status: 500,
        });
      } else if (!providedKey || providedKey !== STATUS_PASSKEY) {
        return new Response("Unauthorized", { status: 401 });
      }

      setStatus({ text: body.text, emoji: body.emoji ?? null });
      return new Response(
        `Status updated to: "${body.emoji || body.emoji === "" ? body.emoji + " " : ""}${body.text}"`,
        { status: 200 },
      );
    },
    {
      body: z.object({
        text: z.string().min(1).max(100),
        emoji: z.emoji().optional().nullable(),
      }),
    },
  );
