/* Shared auth/session/rate-limit helpers for the admin API.
   Not a route itself — imported by files under /functions. Uses only
   Web Crypto (crypto.subtle), which is native to the Workers runtime. */

const SESSION_COOKIE = "cr_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const PBKDF2_ITERATIONS = 100000; // kept in sync with scripts/generate-password-hash.js
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const RATE_LIMIT_MAX_ATTEMPTS = 8;

function base64urlEncode(bytes) {
  let str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return part.slice(idx + 1).trim();
  }
  return null;
}

/* ---------- Password hashing (PBKDF2-SHA256) ---------- */

async function verifyPassword(password, saltB64, expectedHashB64, iterations) {
  const salt = base64DecodeStd(saltB64);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: iterations || PBKDF2_ITERATIONS },
    keyMaterial,
    256
  );
  const derivedB64 = base64EncodeStd(new Uint8Array(derived));
  return timingSafeEqualStrings(derivedB64, expectedHashB64);
}

/* Standard (non-url-safe) base64 helpers, since the password hash/salt
   secrets are generated locally with Node's Buffer.toString("base64"). */
function base64EncodeStd(bytes) {
  return btoa(String.fromCharCode(...bytes));
}
function base64DecodeStd(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function timingSafeEqualStrings(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- Session cookie (HMAC-SHA256 signed) ---------- */

async function getHmacKey(env) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function createSessionCookie(env) {
  const payload = { exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const payloadB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getHmacKey(env);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  const token = payloadB64 + "." + base64urlEncode(new Uint8Array(sig));
  return (
    `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`
  );
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

async function isAuthenticated(env, request) {
  const cookieHeader = request.headers.get("Cookie");
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return false;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let key, valid;
  try {
    key = await getHmacKey(env);
    valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlDecode(sigB64),
      new TextEncoder().encode(payloadB64)
    );
  } catch (e) {
    return false;
  }
  if (!valid) return false;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
  } catch (e) {
    return false;
  }
  return typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
}

/* CSRF defense-in-depth: mutation requests must also carry this header.
   A cross-site <form> POST or plain <img>/redirect can't set custom headers,
   and SameSite=Strict already blocks the cookie from riding along cross-site. */
function hasAdminHeader(request) {
  return request.headers.get("X-Requested-With") === "cr-admin";
}

/* ---------- Login rate limiting (per IP, D1-backed) ---------- */

function getClientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

async function checkRateLimit(env, ip) {
  const row = await env.DB.prepare(
    "SELECT count, first_attempt_at FROM login_attempts WHERE ip = ?"
  )
    .bind(ip)
    .first();
  if (!row) return true;
  const now = Math.floor(Date.now() / 1000);
  if (now - row.first_attempt_at > RATE_LIMIT_WINDOW_SECONDS) return true;
  return row.count < RATE_LIMIT_MAX_ATTEMPTS;
}

async function recordFailedAttempt(env, ip) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    "SELECT count, first_attempt_at FROM login_attempts WHERE ip = ?"
  )
    .bind(ip)
    .first();
  if (!row || now - row.first_attempt_at > RATE_LIMIT_WINDOW_SECONDS) {
    await env.DB.prepare(
      "INSERT INTO login_attempts (ip, count, first_attempt_at) VALUES (?, 1, ?) " +
        "ON CONFLICT(ip) DO UPDATE SET count = 1, first_attempt_at = excluded.first_attempt_at"
    )
      .bind(ip, now)
      .run();
  } else {
    await env.DB.prepare("UPDATE login_attempts SET count = count + 1 WHERE ip = ?").bind(ip).run();
  }
}

async function resetAttempts(env, ip) {
  await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
}

/* ---------- Input validation for scientist records ---------- */

/* Accepts http: too (not just https:) so server-generated /api/photos/...
   URLs still validate under local http dev — Cloudflare Pages itself is
   always served over TLS in production regardless. Still blocks
   javascript:/data:/file: schemes, which is the actual injection concern. */
function isSafeHttpsUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch (e) {
    return false;
  }
}

function isValidName(value) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 200;
}

export {
  verifyPassword,
  createSessionCookie,
  clearSessionCookie,
  isAuthenticated,
  hasAdminHeader,
  getClientIp,
  checkRateLimit,
  recordFailedAttempt,
  resetAttempts,
  isSafeHttpsUrl,
  isValidName,
};
