/**
 * rcan.dev and robotregistryfoundation.org kept separate RRN counters, so the same number
 * could name two robots (#243). New robots register at RRF; rcan.dev refuses new
 * registrations and its resolver falls back to RRF for root RRNs it doesn't hold.
 */
import { describe, expect, it } from "vitest";
import { resolveFromRrf, RRF_REGISTRY_URL } from "../functions/api/v1/resolve/[rrn].js";
import { registrationMoved } from "../functions/api/v1/robots/index.js";

const rrfRecord = { rrn: "RRN-000000000011", name: "bob-spec-b-pick-place", manufacturer: "craigm26" };

function fakeFetch(status: number, body: unknown, seen: string[] = []): typeof fetch {
  return (async (url: string | URL | Request) => {
    seen.push(String(url));
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

describe("registry of record", () => {
  it("POST /api/v1/robots answers 410 and points at RRF", async () => {
    const res = registrationMoved();
    expect(res.status).toBe(410);
    const body = (await res.json()) as Record<string, string>;
    expect(body.register_url).toBe("https://robotregistryfoundation.org/v2/robots/register");
    expect(res.headers.get("Link")).toContain("robotregistryfoundation.org/v2/robots/register");
  });

  it("resolves a root RRN that only RRF holds", async () => {
    const seen: string[] = [];
    const got = await resolveFromRrf("RRN-000000000011", {}, fakeFetch(200, rrfRecord, seen));
    expect(got?.url).toBe(RRF_REGISTRY_URL);
    expect(got?.record.name).toBe("bob-spec-b-pick-place");
    expect(seen).toEqual(["https://robotregistryfoundation.org/v2/robots/RRN-000000000011"]);
  });

  it("an unknown RRN, a mismatched record or an unreachable RRF is not found", async () => {
    expect(await resolveFromRrf("RRN-000000000099", {}, fakeFetch(404, { error: "Robot not found" }))).toBeNull();
    expect(await resolveFromRrf("RRN-000000000011", {}, fakeFetch(200, { rrn: "RRN-000000000012" }))).toBeNull();
    const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await resolveFromRrf("RRN-000000000011", {}, down)).toBeNull();
  });
});
