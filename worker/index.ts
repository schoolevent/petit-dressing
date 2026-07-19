import {
  applySyncMutation,
  type StoredMutation,
  type SyncMutation,
  type SyncState,
} from "../src/syncModel";

type D1Result<T = unknown> = {
  results?: T[];
  success: boolean;
  meta: { changes?: number };
};

type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  run: <T = unknown>() => Promise<D1Result<T>>;
  first: <T = unknown>() => Promise<T | null>;
  all: <T = unknown>() => Promise<D1Result<T>>;
};

type D1Database = {
  prepare: (query: string) => D1PreparedStatement;
  batch: (statements: D1PreparedStatement[]) => Promise<D1Result[]>;
};

type Env = {
  DB: D1Database;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
};

type MutationRow = {
  seq: number;
  mutation_json: string;
};

type SpaceRow = {
  initial_state: string;
};

let schemaPromise: Promise<void> | null = null;

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function getRoomCode(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer\s+([A-Z2-9-]+)$/i);
  if (!match) return null;

  const normalized = match[1].replace(/-/g, "").toUpperCase();
  return normalized.length >= 16 && normalized.length <= 64
    ? normalized
    : null;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function ensureSchema(db: D1Database) {
  if (!schemaPromise) {
    schemaPromise = db
      .batch([
        db.prepare(`
          CREATE TABLE IF NOT EXISTS dressing_spaces (
            room_hash TEXT PRIMARY KEY,
            initial_state TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )
        `),
        db.prepare(`
          CREATE TABLE IF NOT EXISTS dressing_mutations (
            seq INTEGER PRIMARY KEY AUTOINCREMENT,
            room_hash TEXT NOT NULL,
            mutation_id TEXT NOT NULL UNIQUE,
            mutation_json TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )
        `),
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_dressing_mutations_room_seq
          ON dressing_mutations(room_hash, seq)
        `),
      ])
      .then(() => undefined)
      .catch((error) => {
        schemaPromise = null;
        throw error;
      });
  }

  return schemaPromise;
}

function isSyncState(value: unknown): value is SyncState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<SyncState>;
  return typeof state.babyName === "string" && Array.isArray(state.garments);
}

function isSyncMutation(value: unknown): value is SyncMutation {
  if (!value || typeof value !== "object") return false;
  const mutation = value as Partial<SyncMutation>;
  return (
    typeof mutation.id === "string" &&
    mutation.id.length >= 8 &&
    mutation.id.length <= 100 &&
    typeof mutation.type === "string"
  );
}

async function readJson(request: Request) {
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > 750_000) {
    throw new Error("PAYLOAD_TOO_LARGE");
  }
  return request.json();
}

async function roomExists(db: D1Database, roomHash: string) {
  const row = await db
    .prepare("SELECT room_hash FROM dressing_spaces WHERE room_hash = ?")
    .bind(roomHash)
    .first<{ room_hash: string }>();
  return Boolean(row);
}

async function getFullState(db: D1Database, roomHash: string) {
  const space = await db
    .prepare(
      "SELECT initial_state FROM dressing_spaces WHERE room_hash = ? LIMIT 1",
    )
    .bind(roomHash)
    .first<SpaceRow>();

  if (!space) return null;

  let state = JSON.parse(space.initial_state) as SyncState;
  const result = await db
    .prepare(
      `SELECT seq, mutation_json
       FROM dressing_mutations
       WHERE room_hash = ?
       ORDER BY seq ASC`,
    )
    .bind(roomHash)
    .all<MutationRow>();

  let lastSeq = 0;
  for (const row of result.results ?? []) {
    const mutation = JSON.parse(row.mutation_json) as SyncMutation;
    state = applySyncMutation(state, mutation);
    lastSeq = row.seq;
  }

  return { state, lastSeq };
}

async function handleCreate(request: Request, env: Env, roomHash: string) {
  const body = (await readJson(request)) as { state?: unknown };
  if (!isSyncState(body.state)) {
    return json({ error: "INVALID_STATE" }, 400);
  }

  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO dressing_spaces
     (room_hash, initial_state, created_at)
     VALUES (?, ?, ?)`,
  )
    .bind(roomHash, JSON.stringify(body.state), Date.now())
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return json({ error: "ROOM_ALREADY_EXISTS" }, 409);
  }

  return json({ ok: true, lastSeq: 0 }, 201);
}

async function handleGet(request: Request, env: Env, roomHash: string) {
  const url = new URL(request.url);
  const sinceValue = url.searchParams.get("since");

  if (sinceValue === null) {
    const full = await getFullState(env.DB, roomHash);
    if (!full) return json({ error: "ROOM_NOT_FOUND" }, 404);
    return json(full);
  }

  const since = Number.parseInt(sinceValue, 10);
  if (!Number.isFinite(since) || since < 0) {
    return json({ error: "INVALID_CURSOR" }, 400);
  }

  if (!(await roomExists(env.DB, roomHash))) {
    return json({ error: "ROOM_NOT_FOUND" }, 404);
  }

  const result = await env.DB.prepare(
    `SELECT seq, mutation_json
     FROM dressing_mutations
     WHERE room_hash = ? AND seq > ?
     ORDER BY seq ASC
     LIMIT 500`,
  )
    .bind(roomHash, since)
    .all<MutationRow>();

  const mutations: StoredMutation[] = (result.results ?? []).map((row) => ({
    seq: row.seq,
    mutation: JSON.parse(row.mutation_json) as SyncMutation,
  }));

  return json({
    mutations,
    lastSeq: mutations.at(-1)?.seq ?? since,
    hasMore: mutations.length === 500,
  });
}

async function handleMutation(request: Request, env: Env, roomHash: string) {
  if (!(await roomExists(env.DB, roomHash))) {
    return json({ error: "ROOM_NOT_FOUND" }, 404);
  }

  const body = (await readJson(request)) as { mutation?: unknown };
  if (!isSyncMutation(body.mutation)) {
    return json({ error: "INVALID_MUTATION" }, 400);
  }

  const serialized = JSON.stringify(body.mutation);
  if (serialized.length > 600_000) {
    return json({ error: "MUTATION_TOO_LARGE" }, 413);
  }

  await env.DB.prepare(
    `INSERT OR IGNORE INTO dressing_mutations
     (room_hash, mutation_id, mutation_json, created_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(roomHash, body.mutation.id, serialized, Date.now())
    .run();

  const row = await env.DB.prepare(
    `SELECT seq FROM dressing_mutations
     WHERE room_hash = ? AND mutation_id = ?
     LIMIT 1`,
  )
    .bind(roomHash, body.mutation.id)
    .first<{ seq: number }>();

  if (!row) {
    return json({ error: "MUTATION_NOT_SAVED" }, 500);
  }

  return json({ ok: true, seq: row.seq });
}

async function handleApi(request: Request, env: Env) {
  await ensureSchema(env.DB);

  if (new URL(request.url).pathname === "/api/health") {
    return json({ ok: true });
  }

  const roomCode = getRoomCode(request);
  if (!roomCode) {
    return json({ error: "MISSING_OR_INVALID_SYNC_CODE" }, 401);
  }
  const roomHash = await sha256(roomCode);
  const path = new URL(request.url).pathname;

  if (path === "/api/sync/create" && request.method === "POST") {
    return handleCreate(request, env, roomHash);
  }

  if (path === "/api/sync" && request.method === "GET") {
    return handleGet(request, env, roomHash);
  }

  if (path === "/api/sync/mutate" && request.method === "POST") {
    return handleMutation(request, env, roomHash);
  }

  return json({ error: "NOT_FOUND" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const path = new URL(request.url).pathname;
      if (path.startsWith("/api/")) {
        return await handleApi(request, env);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error && error.message === "PAYLOAD_TOO_LARGE"
          ? "PAYLOAD_TOO_LARGE"
          : "INTERNAL_ERROR";
      return json({ error: message }, message === "PAYLOAD_TOO_LARGE" ? 413 : 500);
    }
  },
};
