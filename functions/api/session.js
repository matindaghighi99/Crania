import { isAuthenticated } from "../../lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const authenticated = await isAuthenticated(env, request);
  return new Response(JSON.stringify({ authenticated }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
