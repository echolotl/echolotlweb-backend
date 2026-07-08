import { Database } from "bun:sqlite";
import type { SpotifyTokenRecord } from "./spotify/model";
import type { Status } from "./status/model";
import { Session, User } from "./auth/discord/model";
import { encrypt, decrypt } from "./util/crypto";
const dbPath = () => {
  const devEnv = process.env.NODE_ENV === "development";
  const defaultPath = devEnv ? "./data/dev.db" : "./data/main.db";
  return process.env.DB_PATH ?? defaultPath;
};
const db = new Database(dbPath());

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
	);

	-- Discord OAuth users
	CREATE TABLE IF NOT EXISTS users (
	  id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
		username TEXT NOT NULL,
		display_name TEXT,
		avatar_hash TEXT,
    anonymous INTEGER NOT NULL DEFAULT 0,
		created_at BIGINT NOT NULL,
		updated_at BIGINT NOT NULL,

		-- Token stuff
		refresh_token TEXT NOT NULL,
		access_token TEXT,
		token_expires BIGINT
	);

	CREATE TABLE IF NOT EXISTS sessions (
	  token TEXT PRIMARY KEY,
		id TEXT NOT NULL REFERENCES users(id),
		created_at BIGINT NOT NULL,
		expires_at BIGINT NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_sessions_id ON sessions(id);
`);

const userTableColumns = db.query(`PRAGMA table_info(users)`).all() as {
  name: string;
}[];

if (!userTableColumns.some((column) => column.name === "user_id")) {
  db.run(`ALTER TABLE users ADD COLUMN user_id TEXT`);
}

if (!userTableColumns.some((column) => column.name === "anonymous")) {
  db.run(`ALTER TABLE users ADD COLUMN anonymous INTEGER NOT NULL DEFAULT 0`);
}

db.run(`UPDATE users SET user_id = id WHERE user_id IS NULL OR user_id = ''`);
db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id)`);

const upsertSpotifyTokenStmt = db.prepare(
  `INSERT INTO spotify_token (id, access_token, expires_at)
	 VALUES (1, ?, ?)
	 ON CONFLICT(id)
	 DO UPDATE SET access_token = excluded.access_token, expires_at = excluded.expires_at`,
);

const getSpotifyTokenStmt = db.prepare(
  `SELECT access_token, expires_at
	 FROM spotify_token
	 WHERE id = 1`,
);

const getLatestStatusStmt = db.prepare(
  `SELECT text, emoji, created_at
	 FROM statuses
	 ORDER BY created_at DESC
	 LIMIT 1`,
);

const getStatusesLimitStmt = db.prepare(
  `SELECT text, emoji, created_at
	 FROM statuses
	 ORDER BY created_at DESC
	 LIMIT ?`,
);

const insertStatusStmt = db.prepare(
  `INSERT INTO statuses (text, emoji, created_at)
	 VALUES (?, ?, ?)`,
);

const insertSessionStmt = db.prepare(
  `INSERT INTO sessions (token, id, created_at, expires_at)
  VALUES ($1, $2, $3, $4)`,
);

const destroySessionStmt = db.prepare(`DELETE FROM sessions WHERE token = $1`);

const updateUserStmt = db.prepare(`
  INSERT INTO users (id, user_id, username, display_name, avatar_hash, anonymous, refresh_token, access_token, token_expires, created_at, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        ON CONFLICT (id) DO UPDATE SET
          user_id = excluded.user_id,
          username = excluded.username,
          display_name = excluded.display_name,
          avatar_hash = excluded.avatar_hash,
          anonymous = excluded.anonymous,
          refresh_token = excluded.refresh_token,
          access_token = excluded.access_token,
          token_expires = excluded.token_expires,
          updated_at = $10`);

const deleteUserStmt = db.prepare(`DELETE FROM users WHERE id = $1`);

const getUserFromSessionQuery = db.query(`
  SELECT u.* FROM sessions s
  JOIN users u ON u.id = s.id
  WHERE s.token = $1 AND s.expires_at > $2
  `);

const getUserByIdStmt = db.query(`SELECT * FROM users WHERE id = $1`);

const getUserByUserIdStmt = db.query(`SELECT * FROM users WHERE user_id = $1`);

const setUserAnonymousStmt = db.prepare(
  `UPDATE users SET anonymous = $1, updated_at = $2 WHERE id = $3`,
);

export function upsertSpotifyToken(record: SpotifyTokenRecord): void {
  upsertSpotifyTokenStmt.run(record.accessToken, record.expiresAt);
}

export function getSpotifyToken(): SpotifyTokenRecord | null {
  const row = getSpotifyTokenStmt.get() as {
    access_token: string;
    expires_at: number;
  } | null;

  if (!row) {
    return null;
  }

  return {
    accessToken: row.access_token,
    expiresAt: Number(row.expires_at),
  };
}

export function getLatestStatus(): Status | null {
  const row = getLatestStatusStmt.get() as {
    text: string;
    emoji: string | null;
    created_at: number;
  } | null;

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
  const rows = getStatusesLimitStmt.all(limit) as {
    text: string;
    emoji: string | null;
    created_at: number;
  }[];

  return rows.map((row) => ({
    text: row.text,
    emoji: row.emoji,
    createdAt: row.created_at,
  }));
}

export function insertStatus(status: Omit<Status, "createdAt">): Status {
  const createdAt = Date.now();
  insertStatusStmt.run(status.text, status.emoji, createdAt);
  return {
    ...status,
    createdAt,
  };
}

export function upsertSession(session: Session): void {
  insertSessionStmt.run(
    session.token,
    session.id,
    session.createdAt,
    session.expiresAt,
  );
}

export function destroySession(token: string): void {
  destroySessionStmt.run(token);
}

export function storeUser(user: Omit<User, "createdAt">) {
  updateUserStmt.run(
    user.id,
    user.userId,
    user.username,
    user.displayName,
    user.avatarHash,
    user.anonymous ? 1 : 0,
    encrypt(user.refreshToken),
    user.accessToken ? encrypt(user.accessToken) : null,
    user.tokenExpires,
    Date.now(),
  );
}

export function deleteUser(id: string) {
  deleteUserStmt.run(id);
}

type UserRow = ChangeType<KeysToSnakeCase<User>, number, "anonymous">;

function mapUserRow(row: UserRow): User {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarHash: row.avatar_hash,
    anonymous: Boolean(row.anonymous),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    refreshToken: decrypt(row.refresh_token),
    accessToken: row.access_token
      ? decrypt(row.access_token)
      : row.access_token,
    tokenExpires: row.token_expires !== null ? Number(row.token_expires) : null,
  };
}

export function userBySession(sessionToken: string | undefined): User | null {
  if (!sessionToken) return null;
  const rows = getUserFromSessionQuery.all(
    sessionToken,
    Date.now(),
  ) as UserRow[];

  const row = rows[0];
  if (!row) return null;

  return mapUserRow(row);
}

export function sessionsByUserId(userId: string): Session[] {
  const rows = db
    .query(`SELECT * FROM sessions WHERE id = $1 AND expires_at > $2`)
    .all(userId, Date.now()) as {
    token: string;
    id: string;
    created_at: number;
    expires_at: number;
  }[];

  return rows.map((row) => ({
    token: row.token,
    id: row.id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}

export function getUserById(id: string): User | null {
  const row = getUserByIdStmt.get(id) as UserRow | null;
  if (!row) return null;

  return mapUserRow(row);
}

export function getUserByUserId(userId: string): User | null {
  const row = getUserByUserIdStmt.get(userId) as UserRow | null;
  if (!row) return null;

  return mapUserRow(row);
}

export function setUserAnonymous(id: string, anonymous: boolean): User | null {
  setUserAnonymousStmt.run(anonymous ? 1 : 0, Date.now(), id);
  return getUserById(id);
}
