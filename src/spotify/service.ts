import { getSpotifyToken, upsertSpotifyToken } from "../db";
import { Logger } from "../util/logger";
import { CurrentlyPlayingResponse, SPOTIFY_CURRENT_PLAYBACK_URL, SPOTIFY_TOKEN_URL } from "./model";
export const getSpotifyRouteMessage = (): string => "Spotify route";

const getEnvVariables = (): {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
} => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
		throw new Error(
			"Spotify environment variables are not set. Please set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN."
		);
	}

    return {
        clientId: clientId || "",
        clientSecret: clientSecret || "",
        refreshToken: refreshToken || "",
    }
}

async function refreshSpotifyToken(): Promise<string> {
    const { clientId, clientSecret, refreshToken } = getEnvVariables();
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
    });

    const response = await fetch(SPOTIFY_TOKEN_URL, {
        method: "POST",
        headers: {
            authorization: `Basic ${authString}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body,
    });

    if (!response.ok) {
        const errorData = await response.json();
        Logger.error(`Failed to refresh Spotify token: ${JSON.stringify(errorData)}`);
        throw new Error(`Failed to refresh Spotify token: ${response.statusText}`);
    }

    const json = (await response.json()) as {
		access_token?: string;
		expires_in?: number;
	};

    if (!json.access_token || !json.expires_in) {
        Logger.error(`Invalid response from Spotify token refresh: ${JSON.stringify(json)}`);
		throw new Error("Invalid response from Spotify token refresh");
	}
    const expiresAt = Date.now() + json.expires_in * 1000;
    upsertSpotifyToken({
		accessToken: json.access_token,
		expiresAt,
	});

    Logger.success("Successfully refreshed Spotify token");

    return json.access_token;
}

async function spotifyToken(): Promise<string> {
	const cached = getSpotifyToken();
	if (cached && cached.expiresAt > Date.now() + 30_000) {
		return cached.accessToken;
	}

	return refreshSpotifyToken();
}

// For /spotify
export async function getCurrentSpotifyPlayback(retry?: boolean): Promise<CurrentlyPlayingResponse | null> {
    const token = await spotifyToken();
    const response = await fetch(SPOTIFY_CURRENT_PLAYBACK_URL, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (response.status === 204) {
        // No content, user is not currently playing anything
        return null;
    }

    if (response.status === 401) {
        // Unauthorized, token might have expired, try refreshing once
        Logger.warning("Spotify token might have expired, refreshing and retrying...");
        await refreshSpotifyToken();
        if (retry) {
            Logger.error("Failed to get current Spotify playback after retrying.");
            return null;
        }
        return getCurrentSpotifyPlayback(true);
    }

    if (response.status === 403) {
        // Forbidden, likely due to Spotify's new API restrictions for free accounts
        Logger.error("Couldn't get playback info (Forbidden). Might have to reset your OAuth.");
        return null;
    }

    if (response.status === 429) {
        // Too many requests, rate limited by Spotify
        Logger.error("Rate limited by Spotify when trying to get current playback.");
        return null;
    }

    if (!response.ok) {
        Logger.error(`Failed to get current Spotify playback: ${response.statusText}`);
        return null;
    }

    const json = (await response.json()) as CurrentlyPlayingResponse;
    return json;
}
