import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.116.0";
import { decodeJwtPayload, isFreshOauthProof, isRecord, oauthAmrTimestamp } from "./oauth-proof.ts";
import { processDeletionRequest, type QueueRow } from "./processor.ts";

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, x-account-deletion-worker-key", "access-control-allow-methods": "POST, OPTIONS" };
const MAX_WORKER_LIMIT = 10;
const OAUTH_MAX_AGE_SECONDS = 300;
const FUTURE_SKEW_SECONDS = 60;

type Json = Record<string, unknown>;
type RpcError = { code?: string; message?: string };

function json(body: Json, status = 200) { return new Response(JSON.stringify(body), { status, headers }); }
function fail(code: string, status = 400, message?: string) { return json({ error: code, ...(message ? { message } : {}) }, status); }
async function sha256Hex(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, "0")).join("");
}
function mapRpcError(error: RpcError | null) {
  const code = error?.message?.split(":")[0]?.trim() || error?.code || "request_failed";
  const status = code === "inactive_owner" ? 403 : code === "last_active_admin" || code === "foreign_group_material" ? 409 : code === "invalid_intent" || code === "expired_intent" || code === "invalid_lease" ? 400 : 503;
  const messages: Record<string, string> = {
    inactive_owner: "This account is not eligible for self-service deletion.",
    foreign_group_material: "Some materials you uploaded belong to another teacher’s group. Ask an administrator to transfer or remove them before deleting your account.",
    last_active_admin: "Another active administrator must be added before this account can be deleted.",
    invalid_intent: "The Google verification expired or is no longer valid. Verify again and retry.",
    expired_intent: "The Google verification expired. Verify again and retry.",
  };
  return { code, status, message: messages[code] ?? "Account deletion could not be completed. Retry from account settings." };
}

function clients() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !serviceKey || !publicKey) throw new Error("configuration_missing");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return { url, serviceKey, publicKey, admin };
}

async function authenticate(request: Request, admin: SupabaseClient) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return null;
  const token = match[1];
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const payload = decodeJwtPayload(token);
  if (!payload || payload.sub !== data.user.id || typeof payload.exp !== "number" || payload.exp <= Date.now() / 1000) return null;
  return { user: data.user, token, payload };
}

async function rpc<T>(admin: SupabaseClient, name: string, args: Json): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw Object.assign(new Error(error.message), { rpcError: error });
  return data as T;
}

function rpcFailure(error: unknown) {
  const rpcError = (error as { rpcError?: RpcError })?.rpcError;
  if (!rpcError) return fail("service_unavailable", 503);
  const mapped = mapRpcError(rpcError);
  return fail(mapped.code, mapped.status, mapped.message);
}

async function processRequest(admin: SupabaseClient, row: QueueRow) {
  return processDeletionRequest({
    rpc: <T>(name: string, args: Json) => rpc<T>(admin, name, args),
    remove: async (bucket, names) => {
      const { error } = await admin.storage.from(bucket).remove(names);
      if (error) throw new Error("storage_cleanup_failed");
    },
    getUser: async (userId) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) return { exists: false, error: /not found|does not exist/i.test(error.message) ? "not_found" as const : "failed" as const };
      return { exists: !!data.user };
    },
    deleteUser: async (userId) => {
      const { error } = await admin.auth.admin.deleteUser(userId, false);
      if (error) throw new Error("auth_delete_failed");
    },
  }, row);
}

async function handleUser(request: Request, body: Json, admin: SupabaseClient, publicKey: string, url: string) {
  const auth = await authenticate(request, admin);
  if (!auth) return fail("unauthorized", 401);
  const userId = auth.user.id;
  const operation = body.operation;
  if (operation === "status") {
    try { return json(await rpc<Json>(admin, "account_deletion_status", { p_user_id: userId })); }
    catch (error) { return rpcFailure(error); }
  }
  if (operation === "retry") {
    try {
      const status = await rpc<{ state: string; request_id?: string | null }>(admin, "account_deletion_status", { p_user_id: userId });
      if (status.state === "completed") return json({ state: "completed", request_id: status.request_id ?? null });
      if (status.state !== "pending" || !status.request_id) return fail("no_pending_deletion", 409);
      const claimed = await rpc<QueueRow[]>(admin, "account_deletion_claim", { p_limit: 1, p_request_id: status.request_id });
      const work = Array.isArray(claimed) ? claimed.find((item) => item.request_id === status.request_id) : null;
      if (!work) return json({ state: "pending", request_id: status.request_id });
      const state = await processRequest(admin, work);
      return json({ state, request_id: status.request_id });
    } catch (error) { return rpcFailure(error); }
  }
  if (operation === "start_google_reauth") {
    const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    try {
      const result = await rpc<{ intent_id: string; created_at: string; expires_at: string }>(admin, "account_deletion_create_intent", { p_user_id: userId, p_nonce_hash: await sha256Hex(nonce), p_expires_at: expiresAt });
      return json({ ...result, nonce });
    } catch (error) { return rpcFailure(error); }
  }
  if (operation === "complete_google_reauth") {
    if (typeof body.intent_id !== "string" || typeof body.nonce !== "string" || body.nonce.length < 32) return fail("invalid_intent", 400);
    const oauthAt = oauthAmrTimestamp(auth.payload);
    const now = Date.now() / 1000;
    if (oauthAt === null || !isFreshOauthProof(auth.payload, now, OAUTH_MAX_AGE_SECONDS, FUTURE_SKEW_SECONDS)) return fail("fresh_google_auth_required", 401);
    try {
      await rpc(admin, "account_deletion_complete_intent", { p_user_id: userId, p_intent_id: body.intent_id, p_nonce_hash: await sha256Hex(body.nonce), p_oauth_amr_at: new Date(oauthAt * 1000).toISOString() });
      return json({ state: "verified", intent_id: body.intent_id, expires_at: new Date((oauthAt + OAUTH_MAX_AGE_SECONDS) * 1000).toISOString() });
    } catch (error) { return rpcFailure(error); }
  }
  if (operation === "delete") {
    if (body.confirmation !== "DELETE" || body.acknowledged !== true) return fail("confirmation_required", 400);
    const method = body.method;
    if (method !== "password" && method !== "google") return fail("reauthentication_required", 400);
    if (method === "password") {
      if (typeof body.password !== "string" || !auth.user.email) return fail("reauthentication_failed", 401);
      const isolated = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const { data, error } = await isolated.auth.signInWithPassword({ email: auth.user.email, password: body.password, options: { captchaToken: typeof body.captchaToken === "string" ? body.captchaToken : undefined } });
      await isolated.auth.signOut({ scope: "local" });
      if (error || data.user?.id !== userId) return fail("reauthentication_failed", 401);
    } else if (typeof body.intent_id !== "string" || typeof body.nonce !== "string" || body.nonce.length < 32) {
      return fail("invalid_intent", 400);
    }
    try {
      const prepared = await rpc<{ request_id: string; state: string }>(admin, "account_deletion_prepare", { p_user_id: userId, p_intent_id: method === "google" ? body.intent_id : null, p_nonce_hash: method === "google" ? await sha256Hex(body.nonce as string) : null, p_method: method });
      const { error: revokeError } = await admin.auth.admin.signOut(auth.token, "global");
      if (revokeError) return json({ state: "pending", request_id: prepared.request_id, error: "session_revocation_pending" });
      const row: QueueRow = { request_id: prepared.request_id, user_id: userId, manifest: null, state: prepared.state, lease_token: "" };
      const claimed = await rpc<QueueRow[]>(admin, "account_deletion_claim", { p_limit: 1, p_request_id: prepared.request_id });
      const work = Array.isArray(claimed) ? claimed.find((item) => item.request_id === row.request_id) : null;
      if (!work) return json({ state: "pending", request_id: row.request_id });
      const state = await processRequest(admin, work);
      return json({ state, request_id: row.request_id });
    } catch (error) { return rpcFailure(error); }
  }
  return fail("unknown_operation", 400);
}

async function handleWorker(request: Request, body: Json, admin: SupabaseClient) {
  const provided = request.headers.get("x-account-deletion-worker-key") ?? "";
  if (provided.length < 32 || provided.length > 256) return fail("unauthorized", 401);
  const authorized = await rpc<boolean>(admin, "account_deletion_worker_authorized", { p_key_hash: await sha256Hex(provided) });
  if (authorized !== true) return fail("unauthorized", 401);
  const limit = typeof body.limit === "number" && Number.isInteger(body.limit) ? Math.min(Math.max(body.limit, 1), MAX_WORKER_LIMIT) : 5;
  const rows = await rpc<QueueRow[]>(admin, "account_deletion_claim", { p_limit: limit, p_request_id: null });
  let completed = 0; let pending = 0;
  for (const row of rows ?? []) {
    if (await processRequest(admin, row) === "completed") completed++; else pending++;
  }
  return json({ state: pending ? "pending" : "complete", claimed: rows?.length ?? 0, completed, pending }, pending ? 503 : 200);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return fail("method_not_allowed", 405);
  let body: unknown;
  try { body = await request.json(); } catch { return fail("invalid_json", 400); }
  if (!isRecord(body) || typeof body.operation !== "string") return fail("invalid_request", 400);
  let setup: ReturnType<typeof clients>;
  try { setup = clients(); } catch { return fail("service_unavailable", 503); }
  try {
    if (body.operation === "worker") return await handleWorker(request, body, setup.admin);
    return await handleUser(request, body, setup.admin, setup.publicKey, setup.url);
  } catch { return fail("service_unavailable", 503); }
});
