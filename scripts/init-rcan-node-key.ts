#!/usr/bin/env tsx
/**
 * One-time bootstrap: mint the Ed25519 keypair for the rcan.dev root node
 * manifest at /.well-known/rcan-node.json, and print the exact wrangler
 * commands for the operator to run.
 *
 * THIS SCRIPT TALKS TO NOTHING. It mints a keypair, writes a local backup, and
 * prints commands. It never contacts Cloudflare and never sets a secret or a
 * var. The operator runs the printed commands.
 *
 *   npx tsx scripts/init-rcan-node-key.ts
 *
 * NOT IDEMPOTENT: every run mints a fresh keypair. Re-running after the node
 * key is live rotates it, which invalidates every manifest_signature anyone
 * has cached and changes the published kid. Precheck before rotating:
 *
 *   curl -sS https://rcan.dev/.well-known/rcan-node.json | \
 *     python3 -c "import sys,json; print(json.load(sys.stdin)['manifest_signature'])"
 *
 * Until the secret and vars are set, the deployed manifest honestly advertises
 * only ["register", "resolve"], publishes null keys, and returns an unsigned
 * manifest_signature carrying the reason. That is the intended unconfigured
 * state, not a failure.
 */

import { writeFileSync } from "node:fs";

const PROJECT = "rcan-spec"; // Cloudflare Pages project name for rcan.dev

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function main() {
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;

  const privDer = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const pubDer = new Uint8Array(await crypto.subtle.exportKey("spki", kp.publicKey));

  // An Ed25519 SPKI body is a 12-byte prefix plus the raw 32-byte key. The
  // manifest publishes the raw key base64url, per the pqc-hybrid-v1 profile.
  const rawPub = pubDer.slice(pubDer.length - 32);

  let bin = "";
  for (const b of privDer) bin += String.fromCharCode(b);
  const privPkcs8B64 = btoa(bin); // standard base64, PKCS#8
  const pubB64url = bytesToBase64url(rawPub);

  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pubB64url)),
  );
  const kid =
    "ed25519-" +
    Array.from(digest)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);

  writeFileSync("/tmp/rcan-node-ed25519-privkey.b64", privPkcs8B64, { mode: 0o600 });

  const out = [
    "",
    "rcan.dev root node Ed25519 keypair minted. Nothing has been deployed.",
    "",
    `  kid (derived, published in manifest_signature):  ${kid}`,
    `  RCAN_NODE_ED25519_PUBKEY (base64url raw 32B):    ${pubB64url}`,
    `  RCAN_NODE_PUBKEY:                                ed25519:${pubB64url}`,
    "  private key (base64 PKCS#8):                     /tmp/rcan-node-ed25519-privkey.b64 (mode 0600)",
    "",
    "1. Set the private half as a Pages secret (paste the file contents at the prompt):",
    "",
    `     npx wrangler pages secret put RCAN_NODE_ED25519_PRIVKEY --project-name=${PROJECT}`,
    "",
    "2. Publish the public halves as plain Pages variables. wrangler 4.x has no",
    "   `pages var put` verb, so use either the dashboard",
    `   (Workers & Pages -> ${PROJECT} -> Settings -> Variables and Secrets -> Production)`,
    "   or a committed [vars] block in wrangler.toml. Both are public values:",
    "",
    "     [vars]",
    `     RCAN_NODE_ED25519_PUBKEY = "${pubB64url}"`,
    `     RCAN_NODE_PUBKEY = "ed25519:${pubB64url}"`,
    "",
    "   RCAN_NODE_PQC_PUBKEY stays unset until an ML-DSA-65 half exists. The",
    "   manifest publishes null for it and claims nothing on its behalf.",
    "",
    "3. Redeploy, then check what the node now advertises:",
    "",
    "     curl -sS https://rcan.dev/.well-known/rcan-node.json",
    "",
    "4. Archive the private key in 1Password and DELETE the local file:",
    "",
    "     rm /tmp/rcan-node-ed25519-privkey.b64",
    "",
    "Publishing this key makes the node's declaration checkable, not authoritative.",
    "A self-signature proves control of the key and nothing about the operator's",
    "independence, which is what the manifest's note field says.",
    "",
  ].join("\n");

  process.stdout.write(out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
