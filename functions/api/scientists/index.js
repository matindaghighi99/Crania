import { isAuthenticated, hasAdminHeader, isSafeHttpsUrl, isValidName } from "../../../lib/auth.js";

export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    "SELECT id, name, photo_url, profile_url FROM scientists ORDER BY name COLLATE NOCASE ASC"
  ).all();
  return new Response(JSON.stringify(results || []), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const authed = await isAuthenticated(env, request);
  if (!authed || !hasAdminHeader(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
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

  const name = body && typeof body.name === "string" ? body.name.trim() : "";
  const photoUrl = body && body.photo_url;
  const profileUrl = body && body.profile_url;

  if (!isValidName(name)) {
    return new Response(JSON.stringify({ error: "Name is required (max 200 characters)." }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  if (!isSafeHttpsUrl(photoUrl)) {
    return new Response(JSON.stringify({ error: "Photo URL must be a valid https:// link." }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  if (!isSafeHttpsUrl(profileUrl)) {
    return new Response(JSON.stringify({ error: "Profile URL must be a valid https:// link." }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const searchKey = name.toLowerCase();
  const result = await env.DB.prepare(
    "INSERT INTO scientists (name, photo_url, profile_url, search_key) VALUES (?, ?, ?, ?) RETURNING id, name, photo_url, profile_url"
  )
    .bind(name, photoUrl, profileUrl, searchKey)
    .first();

  return new Response(JSON.stringify(result), {
    status: 201,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
