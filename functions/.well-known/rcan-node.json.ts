/**
 * GET /.well-known/rcan-node.json — the rcan.dev root node manifest.
 *
 * Every capability in this manifest is a function of key material that is
 * actually configured on the deployment. Nothing here is advertised on the
 * strength of an intention:
 *
 *   register, resolve  always (they need no key)
 *   verify             only when RCAN_NODE_ED25519_PUBKEY is set, so a reader
 *                      has a key to check this node's signatures against
 *   delegate           only when RCAN_NODE_ED25519_PUBKEY is set AND the
 *                      private half (RCAN_NODE_ED25519_PRIVKEY) is bound and
 *                      actually signs, so the node can sign a delegation
 *
 * With none of those set the manifest publishes null keys, the two-verb
 * capability list, and an unsigned manifest_signature that says why. That is
 * the honest description of a node that cannot prove anything.
 *
 * The manifest self-signs: manifest_signature.sig is an Ed25519 signature over
 * the canonical JSON of this object with the manifest_signature member removed.
 * A self-signature proves control of the published key and nothing else; the
 * note field inside manifest_signature says so in the response itself.
 *
 * Environment (Cloudflare Pages vars and secrets on project `rcan-spec`):
 *   RCAN_NODE_PUBKEY          var    "ed25519:<base64url raw 32-byte key>"
 *   RCAN_NODE_ED25519_PUBKEY  var    base64url raw 32-byte Ed25519 public key
 *   RCAN_NODE_PQC_PUBKEY      var    base64url ML-DSA-65 public key (1952 bytes)
 *   RCAN_NODE_ED25519_PRIVKEY secret base64 PKCS#8 Ed25519 private key
 *
 * scripts/init-rcan-node-key.ts mints the pair and prints the exact wrangler
 * commands. It never talks to Cloudflare; the operator runs those commands.
 */

export interface RcanNodeEnv {
  RCAN_NODE_PUBKEY?: string;
  RCAN_NODE_ED25519_PUBKEY?: string;
  RCAN_NODE_PQC_PUBKEY?: string;
  RCAN_NODE_ED25519_PRIVKEY?: string;
}

export const SELF_SIGNED_NOTE =
  "A self-signed declaration proves control of the published key and nothing about the operator's independence. " +
  "RCAN conformance is self-asserted and this manifest is a format, not an authority.";

export const UNSIGNED_NOTE =
  "This node has no usable signing key configured, so the manifest is unsigned and carries no proof of key control. " +
  "The capability list is limited to the verbs that need no key.";

/** Deterministic canonical JSON: object keys sorted recursively, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const parts = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${parts.join(",")}}`;
}

function base64ToBytes(b64: string): Uint8Array {
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** kid = "ed25519-" + first 16 hex chars of SHA-256 over the published key string. */
export async function deriveKid(publicKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(publicKey));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `ed25519-${hex.slice(0, 16)}`;
}

/**
 * Capability list as a function of configured material.
 * `canSign` is the observed result of signing, not the mere presence of a secret.
 */
export function capabilitiesFor(hasEd25519Pubkey: boolean, canSign: boolean): string[] {
  const capabilities = ["register", "resolve"];
  if (hasEd25519Pubkey) capabilities.push("verify");
  if (hasEd25519Pubkey && canSign) capabilities.push("delegate");
  return capabilities;
}

async function signCanonical(privKeyB64: string, input: string): Promise<string | null> {
  try {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      base64ToBytes(privKeyB64) as unknown as BufferSource,
      { name: "Ed25519" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      { name: "Ed25519" },
      key,
      new TextEncoder().encode(input),
    );
    return bytesToBase64url(sig);
  } catch {
    return null;
  }
}

export async function buildManifest(env: RcanNodeEnv = {}): Promise<Record<string, unknown>> {
  const ed25519PublicKey = env.RCAN_NODE_ED25519_PUBKEY || null;
  const publicKey = env.RCAN_NODE_PUBKEY || null;
  const pqcPublicKey = env.RCAN_NODE_PQC_PUBKEY || null;
  const privKey = env.RCAN_NODE_ED25519_PRIVKEY || null;

  const base = (capabilities: string[]) => ({
    rcan_node_version: "1.0",
    node_type: "root",
    operator: "Robot Registry Foundation",
    namespace_prefix: "RRN",
    public_key: publicKey,
    crypto_profile: "pqc-hybrid-v1",
    pqc_public_key: pqcPublicKey,
    ed25519_public_key: ed25519PublicKey,
    api_base: "https://rcan.dev/api/v1",
    registry_ui: "https://rcan.dev/registry/",
    spec_version: "2.3",
    capabilities,
    sync_endpoint: "https://rcan.dev/api/v1/sync",
    ttl_seconds: 3600,
    contact: "registry@rcan.dev",
    governance: "https://rcan.dev/governance/",
    federation_protocol: "https://rcan.dev/federation/",
  });

  const unsigned = (reason: string) => ({
    ...base(capabilitiesFor(Boolean(ed25519PublicKey), false)),
    manifest_signature: {
      alg: "Ed25519",
      kid: null,
      sig: null,
      reason,
      note: UNSIGNED_NOTE,
    },
  });

  if (!ed25519PublicKey || !privKey) {
    return unsigned(
      !ed25519PublicKey && !privKey
        ? "RCAN_NODE_ED25519_PUBKEY and RCAN_NODE_ED25519_PRIVKEY are not configured on this deployment"
        : !ed25519PublicKey
          ? "RCAN_NODE_ED25519_PUBKEY is not configured on this deployment"
          : "RCAN_NODE_ED25519_PRIVKEY is not configured on this deployment",
    );
  }

  // Sign over the canonical JSON of the manifest with manifest_signature removed.
  const signable = base(capabilitiesFor(true, true));
  const sig = await signCanonical(privKey, canonicalJson(signable));

  if (!sig) {
    // The secret is bound but does not produce a signature, so this node cannot
    // sign a delegation. Say so rather than advertise the verb.
    return unsigned("RCAN_NODE_ED25519_PRIVKEY did not produce a signature");
  }

  return {
    ...signable,
    manifest_signature: {
      alg: "Ed25519",
      kid: await deriveKid(ed25519PublicKey),
      sig,
      note: SELF_SIGNED_NOTE,
    },
  };
}

export const onRequest = async (context: { env?: RcanNodeEnv }): Promise<Response> => {
  const manifest = await buildManifest(context?.env ?? {});
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
