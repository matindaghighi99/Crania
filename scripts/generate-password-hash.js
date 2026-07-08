#!/usr/bin/env node
/* One-time local helper: hashes an admin password with PBKDF2-SHA256 so the
   plaintext never needs to be stored anywhere. Run this once, paste the two
   printed values into `wrangler pages secret put`, then forget the password
   (or keep it in a password manager) — only the hash+salt live on Cloudflare. */

const crypto = require("crypto");
const readline = require("readline");

// Must match PBKDF2_ITERATIONS in lib/auth.js
const ITERATIONS = 100000;
const KEY_LENGTH = 32; // bytes (256 bits)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("Admin password: ", (password) => {
  rl.close();
  if (!password || password.length < 8) {
    console.error("\nPassword should be at least 8 characters. Run again with a stronger password.");
    process.exit(1);
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, "sha256");

  console.log("\nSet these as Cloudflare Pages secrets (they do not need to match each other in\nany special way — just paste each value exactly as printed):\n");
  console.log("ADMIN_PASSWORD_SALT =", salt.toString("base64"));
  console.log("ADMIN_PASSWORD_HASH =", hash.toString("base64"));
  console.log("\nExample:");
  console.log("  npx wrangler pages secret put ADMIN_PASSWORD_SALT --project-name crania-site");
  console.log("  npx wrangler pages secret put ADMIN_PASSWORD_HASH --project-name crania-site");
  console.log("\nDo not commit these values or the plaintext password anywhere.");
});
