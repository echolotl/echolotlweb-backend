import { Elysia } from "elysia";
import cors from "@elysiajs/cors";
import { SpotifyResponse } from "./model";
import { getCurrentSpotifyPlayback } from "./service";
import { rateLimit } from "elysia-rate-limit";

export const spotifyRouter = new Elysia({ prefix: "/spotify" })
  .use(cors({ methods: ["GET"] }))
  .use(
    rateLimit({
      duration: 60 * 1000,
      max: 30,
      errorResponse: "Rate limit exceeded",
      scoping: "scoped",
    }),
  )
  .get("/", async () => {
    const playback = await getCurrentSpotifyPlayback();
    if (!playback) {
      return new Response(null, { status: 204 });
    }
    if (playback.currently_playing_type !== "track") {
      // Only support tracks for now, skip if it's an episode, ad, or unknown
      return new Response(null, { status: 204 });
    }

    const echolotlPlayback = {
      playing: playback.is_playing,
      title: playback.item?.name || "",
      durationMs: playback.item?.duration_ms || 0,
      progressMs: playback.progress_ms,
      artists:
        playback.item && "artists" in playback.item
          ? playback.item.artists.map((artist) => ({
              name: artist.name,
              href: artist.href,
            }))
          : [],
      album:
        playback.item && "album" in playback.item
          ? {
              name: playback.item.album.name,
              href: playback.item.album.href,
              imageUrl: playback.item.album.images[0]?.url || null,
            }
          : { name: "", href: "", imageUrl: null },
    };

    const response: SpotifyResponse = echolotlPlayback;
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
