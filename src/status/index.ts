import { Elysia, t } from "elysia";
import cors from "@elysiajs/cors";
import { z } from "zod";
import { getStatus, setStatus, getStatuses } from "./service";
import { passkeyAuth } from "../auth";
import { rateLimit } from "elysia-rate-limit";

export const statusRouter = new Elysia({ prefix: "/status" })
  .use(cors({
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }))
  .use(rateLimit({
    duration: 120 * 1000, 
    max: 15, 
    errorResponse: "Rate limit exceeded",
    scoping: "scoped"
  }))
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
    (ctx) => {
      if (!ctx.request.headers.has("Authorization")) {
        return new Response("Unauthorized", { status: 401 });
      } else if (!passkeyAuth(ctx.request.headers.get("Authorization"))) {
        return new Response("Forbidden", { status: 403 });
      }

      setStatus({ text: ctx.body.text, emoji: ctx.body.emoji ?? null });
      return new Response(
        `Status updated to: "${ctx.body.emoji || ctx.body.emoji === "" ? ctx.body.emoji + " " : ""}${ctx.body.text}"`,
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
