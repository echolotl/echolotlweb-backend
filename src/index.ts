import { Elysia, InvertedStatusMap } from "elysia";
import { Logger } from "./util/logger";
import { spotifyRouter } from "./spotify";
import { statusRouter } from "./status";
import { authRouter } from "./auth";
import { file } from "bun";
import cors from "@elysiajs/cors";
import { ALLOWED_ORIGINS } from "./constants";

const fileRouter = new Elysia().get("/assets/*", ({ params }) => {
  const requestedPath = params["*"];
  const filePath = `./src/assets/${requestedPath}`;
  return new Response(file(filePath), {
    headers: { "Content-Type": file(filePath).type },
  });
});

const app = new Elysia()
  .use(cors({ origin: ALLOWED_ORIGINS }))
  .onRequest(({ request }) => {
    Logger.hex(
      "#f53eb8",
      Logger.fmtPackage(
        "REQ",
        "/" + request.url.split("/").slice(3).join("/"),
        "#f53eb8",
      ),
    );
  })
  .onAfterResponse(({ responseValue }) => {
    if (responseValue instanceof Response) {
      if (responseValue.status >= 500) {
        Logger.error(
          `${Logger.fmtPackage(`${responseValue.status} ` + InvertedStatusMap[responseValue.status as keyof typeof InvertedStatusMap])} `,
        );
      } else if (responseValue.status >= 400) {
        Logger.warning(
          `${Logger.fmtPackage(`${responseValue.status} ` + InvertedStatusMap[responseValue.status as keyof typeof InvertedStatusMap])} `,
        );
      } else {
        Logger.success(
          `${Logger.fmtPackage(`${responseValue.status} ` + InvertedStatusMap[responseValue.status as keyof typeof InvertedStatusMap])} `,
        );
      }
    }
    Logger.nl();
  })
  .use(spotifyRouter)
  .use(statusRouter)
  .use(authRouter)
  .use(fileRouter)
  .get(
    "/",
    () =>
      new Response(file("./src/assets/index.html"), {
        headers: {
          "Content-Type": "text/html",
        },
      }),
  )
  .listen(3000);

Logger.statement(
  Logger.fmtPackage("SERVER") +
    `Server started on ${app.server?.hostname}:${app.server?.port}`,
);
