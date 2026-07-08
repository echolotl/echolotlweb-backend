import { Elysia } from "elysia";
import cors from "@elysiajs/cors";
import { discordRouter } from "./discord";
import { ALLOWED_ORIGINS } from "../constants";

export const authRouter = new Elysia({ prefix: "/auth" })
  .use(
    cors({
      origin: ALLOWED_ORIGINS,
      credentials: true,
      methods: ["GET", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type"],
    }),
  )
  .use(discordRouter);
