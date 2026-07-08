import { Elysia, t } from "elysia";
import cors from "@elysiajs/cors";
import { z } from "zod";
import { getStatus, setStatus, getStatuses } from "./service";
import { rateLimit } from "elysia-rate-limit";
import { ALLOWED_ORIGINS, STATUS_PASSKEY } from "../constants";
import { limit, paginate } from "../util/pagination";

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
      const pageSize = limit(query.limit);
      const statuses = getStatuses(pageSize + 1, query.cursor);
      const { items, nextCursor } = paginate(statuses, pageSize);

      if (items.length === 0) {
        return new Response(null, { status: 204 });
      }

      const newJson = {
        total: items.length,
        statuses: items,
        nextCursor,
      };
      return new Response(JSON.stringify(newJson), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number()),
        cursor: t.Optional(t.Number()),
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
          headers: { "Content-Type": "text/plain" },
        });
      } else if (!providedKey || providedKey !== STATUS_PASSKEY) {
        return new Response("Unauthorized", {
          status: 401,
          headers: { "Content-Type": "text/plain" },
        });
      }

      setStatus({ text: body.text, emoji: body.emoji ?? null });
      return new Response(
        `Status updated to: "${body.emoji || body.emoji === "" ? body.emoji + " " : ""}${body.text}"`,
        { status: 200, headers: { "Content-Type": "text/plain" } },
      );
    },
    {
      body: z.object({
        text: z.string().min(1).max(100),
        emoji: z.emoji().optional().nullable(),
      }),
    },
  );
