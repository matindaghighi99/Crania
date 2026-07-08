import { isAuthenticated, hasAdminHeader } from "../../../lib/auth.js";

export async function onRequestDelete(context) {
  const { request, env, params } = context;

  const authed = await isAuthenticated(env, request);
  if (!authed || !hasAdminHeader(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id)) {
    return new Response(JSON.stringify({ error: "Invalid id." }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  await env.DB.prepare("DELETE FROM scientists WHERE id = ?").bind(id).run();

  return new Response(JSON.stringify({ deleted: id }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
