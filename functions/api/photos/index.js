import { isAuthenticated, hasAdminHeader } from "../../../lib/auth.js";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const authed = await isAuthenticated(env, request);
  if (!authed || !hasAdminHeader(request)) {
    return json({ error: "Unauthorized." }, 401);
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return json({ error: "Invalid upload." }, 400);
  }

  const file = form.get("photo");
  if (!file || typeof file === "string") {
    return json({ error: "No photo file provided." }, 400);
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return json({ error: "Photo must be a JPEG, PNG, or WEBP image." }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ error: "Photo must be smaller than 5MB." }, 400);
  }

  const key = crypto.randomUUID() + "." + ext;
  await env.PHOTOS.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const url = new URL("/api/photos/" + key, request.url).href;
  return json({ url }, 201);
}
