import { Database } from "bun:sqlite";
import type { SpotifyTokenRecord } from "./spotify/model";
import type { Status } from "./status/model";

const db = new Database("./data/main.db");

// init
db.run(`
    CREATE TABLE IF NOT EXISTS spotify_token (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        access_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL
    );

	CREATE TABLE IF NOT EXISTS statuses (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		text TEXT NOT NULL,
		emoji TEXT,
		created_at INTEGER NOT NULL
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

const getLatestStatusStmt = db.prepare(
	`SELECT text, emoji, created_at
	 FROM statuses
	 ORDER BY created_at DESC
	 LIMIT 1`
);

const getStatusesLimitStmt = db.prepare(
	`SELECT text, emoji, created_at
	 FROM statuses
	 ORDER BY created_at DESC
	 LIMIT ?`
);

const insertStatusStmt = db.prepare(
	`INSERT INTO statuses (text, emoji, created_at)
	 VALUES (?, ?, ?)`
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

export function getLatestStatus(): Status | null {
	const row = getLatestStatusStmt.get() as
		| { text: string; emoji: string | null; created_at: number }
		| null;

	if (!row) {
		return null;
	}

	return {
		text: row.text,
		emoji: row.emoji,
		createdAt: row.created_at,
	};
}

export function getStatusesLimit(limit: number): Status[] {
	const rows = getStatusesLimitStmt.all(limit) as
		{ text: string; emoji: string | null; created_at: number }[];

	return rows.map(row => ({
		text: row.text,
		emoji: row.emoji,
		createdAt: row.created_at,
	}));
}

export function insertStatus(status: Omit<Status, "createdAt">): void {
	const createdAt = Date.now();
	insertStatusStmt.run(status.text, status.emoji, createdAt);
}