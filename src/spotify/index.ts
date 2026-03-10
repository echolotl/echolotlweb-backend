import { Elysia } from "elysia";
import { EcholotlSpotifyPlayback } from "./model";
import { getCurrentSpotifyPlayback } from "./service";

export const spotifyRouter = new Elysia({ prefix: "/spotify" }).get(
  "/",
  async () => {
    const playback = await getCurrentSpotifyPlayback();
    if (!playback) {
      return new Response("No active Spotify playback found", { status: 204 });
    }

    const {
      actions,
      context,
      device,
      repeat_state,
      shuffle_state,
      ...echolotlPlayback
    } = playback;

    const response: EcholotlSpotifyPlayback = echolotlPlayback;
    return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
  }
);