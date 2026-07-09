import {
  verifyPassword,
  createSessionCookie,
  getClientIp,
  checkRateLimit,
  recordFailedAttempt,
  resetAttempts,
} from "../../lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ADMIN_PASSWORD_SALT || !env.ADMIN_PASSWORD_HASH || !env.SESSION_SECRET) {
    return new Response(JSON.stringify({ error: "Admin login is not configured on the server." }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const ip = getClientIp(request);

  const allowed = await checkRateLimit(env, ip);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Too many attempts. Try again later." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid request." }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const password = body && body.password;
  if (typeof password !== "string" || password.length === 0) {
    return new Response(JSON.stringify({ error: "Password required." }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const ok = await verifyPassword(password, env.ADMIN_PASSWORD_SALT, env.ADMIN_PASSWORD_HASH);
  if (!ok) {
    await recordFailedAttempt(env, ip);
    return new Response(JSON.stringify({ error: "Incorrect password." }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  await resetAttempts(env, ip);
  const cookie = await createSessionCookie(env);
  return new Response(JSON.stringify({ authenticated: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": cookie,
    },
  });
}
