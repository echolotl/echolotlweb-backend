import { Database } from "bun:sqlite";
import type { SpotifyTokenRecord } from "./spotify/model";

const db = new Database("./data/main.db");

// init
db.run(`
    CREATE TABLE IF NOT EXISTS spotify_token (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        access_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL
    )
`);

const upsertSpotifyTokenStmt = db.prepare(
	`INSERT INTO spotify_token (id, access_token, expires_at)
	 VALUES (1, ?, ?)
	 ON CONFLICT(id)
	 DO UPDATE SET access_token = excluded.access_token, expires_at = excluded.expires_at`
);

const getSpotifyTokenStmt = db.prepare(
	`SELECT access_token, expires_at
	 FROM spotify_token
	 WHERE id = 1`
);

export function upsertSpotifyToken(record: SpotifyTokenRecord): void {
    upsertSpotifyTokenStmt.run(record.accessToken, record.expiresAt);
}

export function getSpotifyToken(): SpotifyTokenRecord | null {
    const row = getSpotifyTokenStmt.get() as
		| { access_token: string; expires_at: number }
		| null;

	if (!row) {
		return null;
	}

	return {
		accessToken: row.access_token,
		expiresAt: Number(row.expires_at),
	};
}