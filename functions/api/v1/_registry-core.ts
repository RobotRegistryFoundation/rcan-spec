/**
 * rcan.dev — generic Registry core (shared by the RCN / RMN / RHN sibling
 * registries). Underscore-prefixed → NOT itself a route; imported by the thin
 * per-registry handlers (components/, models/, harnesses/).
 *
 * Mirrors the robots/ (RRN) registry exactly — same D1 binding, same numeric
 * zero-padded mint from the autoincrement id, same api-key-on-create, same
 * soft-delete + auth model — parameterized by a RegistryConfig so each kind
 * keeps its own identity + metadata columns.
 *
 * Endpoints (per registry, e.g. components / RCN):
 *   POST   /api/v1/components            Register a component → mint RCN
 *   GET    /api/v1/components            List (paginated, ?q= ?tier= search)
 *   GET    /api/v1/components/:rcn        Resolve a single component card
 *   PATCH  /api/v1/components/:rcn        Update metadata (api-key auth)
 *   DELETE /api/v1/components/:rcn        Soft-delete (api-key or admin)
 *
 * Honesty: an unregistered part/model/harness simply isn't here (404) — the
 * caller keeps its plain string and labels it `unregistered`. We never mint or
 * fabricate an ID on read.
 */

export interface Env {
  DB: D1Database;
  RCAN_API_KEY_SALT?: string;
  RCAN_ADMIN_TOKEN?: string;
}

/** One registry's shape. `idPrefix` (e.g. "RCN") doubles as the id COLUMN name
 *  lowercased ("rcn"). `identity` = the required, slugged fields that uniquely
 *  name the thing (dedupe + canonical uri). `meta` = optional verbatim columns.
 *  `uriKind` = the rcan:// path letter (c/m/h). */
export interface RegistryConfig {
  table: string;
  idPrefix: string;          // "RCN" | "RMN" | "RHN"
  collection: string;        // "/api/v1/components"
  uriKind: string;           // "c" | "m" | "h"
  identity: string[];        // e.g. ["manufacturer","model","serial"]
  meta: string[];            // e.g. ["category","firmware_hash","spec_url","description","contact_email","source"]
  noun: string;              // "component" | "model" | "harness" (messages)
}

const idCol = (c: RegistryConfig) => c.idPrefix.toLowerCase();
/** meta columns safe to expose on the public card (contact_email is private). */
const cardMeta = (c: RegistryConfig) => c.meta.filter((m) => m !== "contact_email");
/** the columns a GET/list card returns, in order. */
const cardCols = (c: RegistryConfig) =>
  [idCol(c), ...c.identity, "uri", "verification_tier", ...cardMeta(c), "registered_at", "updated_at"];

// ── HTTP helpers (identical posture to robots/index.ts) ───────────────────────

function json(data: unknown, status = 200): Response {
  const isCard = status === 200 && typeof data === "object" && data !== null
    && Object.keys(data as Record<string, unknown>).some((k) => /^r[cmh]n$/.test(k));
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": isCard ? "public, max-age=60, stale-while-revalidate=300" : "no-store",
    },
  });
}
function err(message: string, status = 400): Response { return json({ error: message }, status); }
function cors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// ── pure helpers (exported for tests) ─────────────────────────────────────────

/** Zero-padded numeric id, mirroring formatRRN: RCN-000000000042. */
export function formatRegistryId(prefix: string, id: number): string {
  return `${prefix}-${String(id).padStart(12, "0")}`;
}
export function slugify(s: string): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}
/** Canonical rcan:// uri from the slugged identity values, in config order. */
export function buildUri(config: RegistryConfig, identityValues: string[]): string {
  return `rcan://rcan.dev/${config.uriKind}/` + identityValues.map(slugify).join("/");
}
/** Matches this registry's id in a path segment (root or delegated namespace). */
export function idPattern(config: RegistryConfig): RegExp {
  return new RegExp(`^${config.idPrefix}(?:-[A-Z0-9]{2,8})?-\\d{8,16}$`, "i");
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "rcan_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function bearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

// ── handlers (exported for tests) ─────────────────────────────────────────────

export async function handleRegister(req: Request, env: Env, config: RegistryConfig): Promise<Response> {
  let body: Record<string, string>;
  try { body = (await req.json()) as Record<string, string>; }
  catch { return err("Request body must be valid JSON"); }

  // Required identity fields → slug + non-empty.
  const slugged: string[] = [];
  for (const field of config.identity) {
    const v = slugify(body[field] ?? "");
    if (!v) return err(`Required fields: ${config.identity.join(", ")} (a-z, 0-9, hyphens)`);
    slugged.push(v);
  }
  const uri = buildUri(config, slugged);
  const now = new Date().toISOString();
  const id = idCol(config);

  // Dedupe on the full identity tuple (active rows only).
  const dedupeWhere = config.identity.map((f) => `${f} = ?`).join(" AND ");
  const existing = await env.DB.prepare(
    `SELECT ${id} FROM ${config.table} WHERE ${dedupeWhere} AND deleted = 0`,
  ).bind(...slugged).first<Record<string, string>>();
  if (existing) {
    return json({ [id]: existing[id], uri, message: `${config.noun} already registered`, already_existed: true }, 200);
  }

  const rawApiKey = generateApiKey();
  const apiKeyHash = await sha256(rawApiKey + (env.RCAN_API_KEY_SALT ?? "rcan-dev"));

  // Insert identity + meta (verbatim) + uri + api key + timestamps. id/<idCol>
  // are assigned after, from the autoincrement row id (mirrors RRN minting).
  const metaVals = config.meta.map((m) => String(body[m] ?? ""));
  const cols = [...config.identity, "uri", ...config.meta, "api_key_hash", "registered_at", "updated_at"];
  const placeholders = cols.map(() => "?").join(", ");
  const result = await env.DB.prepare(
    `INSERT INTO ${config.table} (${cols.join(", ")}) VALUES (${placeholders})`,
  ).bind(...slugged, uri, ...metaVals, apiKeyHash, now, now).run();
  if (!result.success) return err("Registration failed — please try again", 500);

  const newRow = await env.DB.prepare(
    `SELECT id FROM ${config.table} WHERE uri = ? ORDER BY id DESC LIMIT 1`,
  ).bind(uri).first<{ id: number }>();
  const mintedId = formatRegistryId(config.idPrefix, newRow!.id);
  await env.DB.prepare(`UPDATE ${config.table} SET ${id} = ? WHERE id = ?`).bind(mintedId, newRow!.id).run();

  const out: Record<string, unknown> = { [id]: mintedId, uri, verification_tier: "community", registered_at: now };
  config.identity.forEach((f, i) => { out[f] = slugged[i]; });
  out.api_key = rawApiKey; // shown once — only the hash is stored
  out.message = `${config.noun} registered successfully`;
  return json(out, 201);
}

export async function handleGet(idVal: string, env: Env, config: RegistryConfig): Promise<Response> {
  const id = idCol(config);
  const row = await env.DB.prepare(
    `SELECT ${cardCols(config).join(", ")} FROM ${config.table} WHERE ${id} = ? AND deleted = 0`,
  ).bind(idVal.toUpperCase()).first();
  if (!row) return err(`${config.noun} not found: ${idVal}`, 404);
  return json(row);
}

export async function handleList(req: Request, env: Env, config: RegistryConfig): Promise<Response> {
  const url = new URL(req.url);
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "20");
  const limit = Math.min(100, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit));
  let offset: number;
  if (url.searchParams.has("offset")) {
    const rawOffset = parseInt(url.searchParams.get("offset") ?? "0");
    offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);
  } else {
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
    offset = (page - 1) * limit;
  }
  const id = idCol(config);
  const search = url.searchParams.get("q")?.trim() ?? "";
  const tier = url.searchParams.get("tier")?.trim() ?? "";

  let whereClause = "deleted = 0";
  const params: (string | number)[] = [];
  if (search) {
    // search the id + every identity column
    const cols = [id, ...config.identity];
    whereClause += " AND (" + cols.map((c) => `${c} LIKE ?`).join(" OR ") + ")";
    cols.forEach(() => params.push(`%${search}%`));
  }
  if (tier) { whereClause += " AND verification_tier = ?"; params.push(tier); }

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM ${config.table} WHERE ${whereClause}`,
  ).bind(...params).first<{ total: number }>();
  const rows = await env.DB.prepare(
    `SELECT ${cardCols(config).join(", ")} FROM ${config.table} WHERE ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
  ).bind(...params, limit, offset).all();

  const total = countResult?.total ?? 0;
  const nextOffset = offset + limit < total ? offset + limit : null;
  return json({ [config.table]: rows.results, total, limit, offset, next_offset: nextOffset });
}

export async function handleUpdate(idVal: string, req: Request, env: Env, config: RegistryConfig): Promise<Response> {
  const token = bearerToken(req);
  if (!token) return err("Authorization required", 401);
  const id = idCol(config);
  const keyHash = await sha256(token + (env.RCAN_API_KEY_SALT ?? "rcan-dev"));
  const rec = await env.DB.prepare(
    `SELECT id, api_key_hash FROM ${config.table} WHERE ${id} = ? AND deleted = 0`,
  ).bind(idVal.toUpperCase()).first<{ id: number; api_key_hash: string }>();
  if (!rec) return err(`${config.noun} not found: ${idVal}`, 404);
  if (rec.api_key_hash !== keyHash) return err("Invalid API key", 403);

  let body: Record<string, string>;
  try { body = (await req.json()) as Record<string, string>; }
  catch { return err("Request body must be valid JSON"); }

  // Only metadata is mutable — identity is immutable (it minted the id + uri).
  const updates: string[] = [];
  const values: (string | number)[] = [];
  for (const field of config.meta) {
    if (field in body) { updates.push(`${field} = ?`); values.push(String(body[field] ?? "")); }
  }
  if (updates.length === 0) return err("No updatable fields provided");
  updates.push("updated_at = ?");
  values.push(new Date().toISOString(), rec.id);
  await env.DB.prepare(`UPDATE ${config.table} SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
  return handleGet(idVal, env, config);
}

export async function handleDelete(idVal: string, req: Request, env: Env, config: RegistryConfig): Promise<Response> {
  const token = bearerToken(req);
  if (!token) return err("Authorization required", 401);
  const id = idCol(config);
  const keyHash = await sha256(token + (env.RCAN_API_KEY_SALT ?? "rcan-dev"));
  const rec = await env.DB.prepare(
    `SELECT id, api_key_hash FROM ${config.table} WHERE ${id} = ? AND deleted = 0`,
  ).bind(idVal.toUpperCase()).first<{ id: number; api_key_hash: string }>();
  if (!rec) return err(`${config.noun} not found: ${idVal}`, 404);
  if (rec.api_key_hash !== keyHash) {
    if (!(env.RCAN_ADMIN_TOKEN && token === env.RCAN_ADMIN_TOKEN)) return err("Invalid API key", 403);
  }
  await env.DB.prepare(
    `UPDATE ${config.table} SET deleted = 1, updated_at = ? WHERE id = ?`,
  ).bind(new Date().toISOString(), rec.id).run();
  return json({ message: `${config.noun} registration removed`, [id]: idVal.toUpperCase() });
}

// ── Pages-Functions entry factory ─────────────────────────────────────────────

/** Build the onRequest both index.ts (collection) and [id].ts (item) re-export.
 *  The path's last segment decides collection vs item — no per-route regex. */
export function makeOnRequest(config: RegistryConfig) {
  const itemRe = idPattern(config);
  return async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
    const { request, env } = context;
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") return cors();
    const segs = new URL(request.url).pathname.split("/").filter(Boolean);
    const last = segs[segs.length - 1] || "";
    try {
      if (itemRe.test(last)) {
        const idVal = last.toUpperCase();
        if (method === "GET") return await handleGet(idVal, env, config);
        if (method === "PATCH") return await handleUpdate(idVal, request, env, config);
        if (method === "DELETE") return await handleDelete(idVal, request, env, config);
        return err("Method not allowed", 405);
      }
      if (method === "GET") return await handleList(request, env, config);
      if (method === "POST") return await handleRegister(request, env, config);
      return err("Method not allowed", 405);
    } catch (e) {
      console.error("registry error:", e);
      return err("Internal server error", 500);
    }
  };
}

// ── the three sibling registry configs ────────────────────────────────────────

export const COMPONENTS: RegistryConfig = {
  table: "components", idPrefix: "RCN", collection: "/api/v1/components", uriKind: "c", noun: "Component",
  identity: ["manufacturer", "model", "serial"],
  meta: ["category", "firmware_hash", "spec_url", "description", "contact_email", "source"],
};
export const MODELS: RegistryConfig = {
  table: "models", idPrefix: "RMN", collection: "/api/v1/models", uriKind: "m", noun: "Model",
  identity: ["provider", "model", "version"],
  meta: ["modality", "weights_sha256", "eval_url", "description", "contact_email", "source"],
};
export const HARNESSES: RegistryConfig = {
  table: "harnesses", idPrefix: "RHN", collection: "/api/v1/harnesses", uriKind: "h", noun: "Harness",
  identity: ["name", "version"],
  meta: ["repo", "build_hash", "capabilities", "description", "contact_email", "source"],
};
