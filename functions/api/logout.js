import { clearSessionCookie } from "../../lib/auth.js";

export async function onRequestPost(context) {
  return new Response(JSON.stringify({ authenticated: false }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": clearSessionCookie(),
    },
  });
}
