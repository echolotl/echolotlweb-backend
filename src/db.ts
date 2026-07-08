import { Database } from "bun:sqlite";
import type { SpotifyTokenRecord } from "./spotify/model";
import type { Status } from "./status/model";
import { Session, User } from "./auth/discord/model";
import { Comment } from "./comments/model";
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

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(user_id),
    slug TEXT NOT NULL, -- the slug of the item the comment is associated with
    parent_id INTEGER REFERENCES comments(id),
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    edited_at INTEGER,
    deleted_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_comments_slug ON comments(slug);
  CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
`);

// -- MIGRATION --
// Add `user_id` and `anonymous` columns to `users` table if they don't exist
const userTableColumns = db.query(`PRAGMA table_info(users)`).all() as {
  name: string;
}[];

if (!userTableColumns.some((column) => column.name === "user_id")) {
  db.run(`ALTER TABLE users ADD COLUMN user_id TEXT`);
}

if (!userTableColumns.some((column) => column.name === "anonymous")) {
  db.run(`ALTER TABLE users ADD COLUMN anonymous INTEGER NOT NULL DEFAULT 0`);
}
// ----

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
  `SELECT id, text, emoji, created_at
	 FROM statuses
	 ORDER BY id DESC
	 LIMIT 1`,
);

const getStatusesLimitStmt = db.prepare(
  `SELECT id, text, emoji, created_at
	 FROM statuses
	 ORDER BY id DESC
	 LIMIT ?`,
);

const getStatusesLimitCursorStmt = db.prepare(
  `SELECT id, text, emoji, created_at
	 FROM statuses
	 WHERE id < ?
	 ORDER BY id DESC
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

const insertCommentStmt = db.prepare(
  `INSERT INTO comments (user_id, slug, parent_id, body, created_at, edited_at, deleted_at)
   VALUES ($1, $2, $3, $4, $5, $6, $7)`,
);

const getTopLevelCommentsBySlugStmt = db.prepare(
  `SELECT * FROM comments WHERE slug = $1 AND parent_id IS NULL ORDER BY id ASC LIMIT $2`,
);

const getTopLevelCommentsBySlugCursorStmt = db.prepare(
  `SELECT * FROM comments WHERE slug = $1 AND parent_id IS NULL AND id > $2 ORDER BY id ASC LIMIT $3`,
);

const getCommentsByUserIdStmt = db.prepare(
  `SELECT * FROM comments WHERE user_id = $1 ORDER BY created_at DESC`,
);

const getCommentsByUserIdLimitStmt = db.prepare(
  `SELECT * FROM comments WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
);

const getCommentByIdStmt = db.prepare(`SELECT * FROM comments WHERE id = $1`);

const getCommentsByParentIdStmt = db.prepare(
  `SELECT * FROM comments WHERE parent_id = $1 ORDER BY id ASC LIMIT $2`,
);

const getCommentsByParentIdCursorStmt = db.prepare(
  `SELECT * FROM comments WHERE parent_id = $1 AND id > $2 ORDER BY id ASC LIMIT $3`,
);

const editCommentStmt = db.prepare(
  `UPDATE comments SET body = $1, edited_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
);

const deleteCommentStmt = db.prepare(
  `UPDATE comments SET deleted_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
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
    id: number;
    text: string;
    emoji: string | null;
    created_at: number;
  } | null;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    text: row.text,
    emoji: row.emoji,
    createdAt: row.created_at,
  };
}

export function getStatusesLimit(limit: number, cursor?: number): Status[] {
  const rows = (
    cursor === undefined
      ? getStatusesLimitStmt.all(limit)
      : getStatusesLimitCursorStmt.all(cursor, limit)
  ) as {
    id: number;
    text: string;
    emoji: string | null;
    created_at: number;
  }[];

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    emoji: row.emoji,
    createdAt: row.created_at,
  }));
}

export function insertStatus(status: Omit<Status, "id" | "createdAt">): Status {
  const createdAt = Date.now();
  insertStatusStmt.run(status.text, status.emoji, createdAt);

  const row = db.query(`SELECT last_insert_rowid() AS id`).get() as {
    id: number;
  };

  return {
    ...status,
    id: row.id,
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
type CommentRow = KeysToSnakeCase<Comment>;

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

function mapCommentRow(row: CommentRow): Comment {
  return {
    id: row.id,
    userId: row.user_id,
    slug: row.slug,
    parentId: row.parent_id,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
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

export function getCommentById(id: number) {
  const row = getCommentByIdStmt.get(id) as CommentRow | undefined;
  if (!row) return null;
  return mapCommentRow(row);
}

export function getTopLevelCommentsBySlug(
  slug: string,
  limit: number,
  cursor?: number,
) {
  const rows =
    typeof cursor === "number"
      ? (getTopLevelCommentsBySlugCursorStmt.all(
          slug,
          cursor,
          limit,
        ) as CommentRow[])
      : (getTopLevelCommentsBySlugStmt.all(slug, limit) as CommentRow[]);
  return rows.map(mapCommentRow);
}

export function getCommentsByUserId(userId: string, limit?: number) {
  const rows =
    typeof limit === "number"
      ? (getCommentsByUserIdLimitStmt.all(userId, limit) as CommentRow[])
      : (getCommentsByUserIdStmt.all(userId) as CommentRow[]);
  return rows.map(mapCommentRow);
}

export function getCommentsByParentId(
  parentId: number,
  limit: number,
  cursor?: number,
) {
  const rows =
    typeof cursor === "number"
      ? (getCommentsByParentIdCursorStmt.all(
          parentId,
          cursor,
          limit,
        ) as CommentRow[])
      : (getCommentsByParentIdStmt.all(parentId, limit) as CommentRow[]);
  return rows.map(mapCommentRow);
}

export function getReplyCounts(parentIds: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  if (parentIds.length === 0) return counts;

  const placeholders = parentIds.map((_, i) => `$${i + 1}`).join(", ");
  const rows = db
    .query(
      `SELECT parent_id, COUNT(*) as count FROM comments WHERE parent_id IN (${placeholders}) GROUP BY parent_id`,
    )
    .all(...parentIds) as { parent_id: number; count: number }[];

  for (const row of rows) {
    counts.set(row.parent_id, Number(row.count));
  }
  return counts;
}

export function insertComment(
  userId: string,
  slug: string,
  parentId: number | null,
  body: string,
) {
  const now = Date.now();
  insertCommentStmt.run(userId, slug, parentId, body, now, null, null);

  const row = db.query(`SELECT last_insert_rowid() AS id`).get() as {
    id: number;
  };

  return getCommentById(row.id)!;
}

export function editComment(id: number, body: string) {
  const now = Date.now();
  editCommentStmt.run(body, now, id);

  return getCommentById(id);
}

export function deleteComment(id: number) {
  const now = Date.now();
  deleteCommentStmt.run(now, id);

  return getCommentById(id);
}
