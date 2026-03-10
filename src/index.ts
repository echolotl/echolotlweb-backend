import { Elysia, InvertedStatusMap } from "elysia";
import { Logger } from "./util/logger";
import { spotifyRouter } from "./spotify";
import { file } from "bun";

const app = new Elysia()
  .onRequest(({ request }) => {
    Logger.dim(`${request.method} ${request.url}`);
  })
  .onAfterResponse(({ set }) => {
    if (set.status !== undefined) {
      Logger.dim(
        `└ ${set.status} ${InvertedStatusMap[set.status as keyof typeof InvertedStatusMap] || ""}`,
      );
    }
  })
  .use(spotifyRouter)
  .get("/", () => new Response(file("./src/assets/index.html"), {
    headers: {
      "Content-Type": "text/html",
    },
  }))
  .get("/assets/*", ({ params }) => {
    const requestedPath = params["*"];
    const filePath = `./src/assets/${requestedPath}`;
    return new Response(file(filePath), {
      headers: { "Content-Type": file(filePath).type },
    });
  })
  .listen(3000);

Logger.statement(
  `Server started on ${app.server?.hostname}:${app.server?.port}`,
  "🟢 ",
);
