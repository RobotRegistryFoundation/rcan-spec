# RCAN Audit Bundle v1.0

A single signed envelope wrapping every artifact a robot needs to make a Pattern-4 (Regulated Deployment) compliance claim — cert reports, EU AI Act §22-26 packets, version snapshots — for one robot at one point in time.

## Why nested signatures?

The bundle has two layers of signatures:

1. **Each artifact carries its own signature.** A cert-l1-l4 report is signed by the rcan-spec release key; an eu-act-fria packet is signed by the robot-md release key emitting it; a version-matrix-snapshot is signed by the opencastor-ops aggregator key. **An offline reviewer can replay any single artifact without trusting the bundle aggregator.**
2. **The bundle as a whole is signed by the aggregator.** A reviewer who trusts the aggregator key can verify the bundle's contents without re-resolving every inner signing key against RRF.

This design lets the bundle be replayed in two modes:
- **Strict** — verify every inner artifact against its registered key (slow; offline-replayable).
- **Aggregator-trust** — verify only the bundle signature (fast; assumes the aggregator did the strict work at sign time).

## Canonical JSON serialization

Signatures cover the canonical JSON of the parent object minus the signature field itself.

Canonical JSON is RFC 8785 (JSON Canonicalization Scheme). Its rules, as they apply here:

1. UTF-8 encoding, with no byte order mark.
2. Object members sorted by name, comparing names as sequences of UTF-16 code units (RFC 8785 § 3.2.3). This differs from Unicode code-point order only when names mix characters above U+FFFF with characters in U+E000–U+FFFF: a name starting with U+1F600 (😀) sorts before one starting with U+E000, because U+1F600 is the surrogate pair D83D DE00 and 0xD83D < 0xE000. Names are compared as strings even when they look like numbers: `"10"` sorts before `"9"`.
3. No whitespace outside strings.
4. Numbers are IEEE 754 binary64 values, written as ECMAScript's `Number::toString` writes them (RFC 8785 § 3.2.2.3): `50.0` → `50`, `-0` → `0`, `1e21` → `1e+21`, `1e-7` → `1e-7`, `0.000001` → `0.000001`. An integer that binary64 cannot hold exactly is written as the nearest binary64 value: `9007199254740993` → `9007199254740992`. Whole-number floats therefore come out as integers without a separate rule.
5. Strings: `"` and `\` are written `\"` and `\\`; U+0008, U+0009, U+000A, U+000C and U+000D are written `\b`, `\t`, `\n`, `\f` and `\r`; any other character below U+0020 is written `\u00` and two lowercase hexadecimal digits. Every other character, including non-ASCII, `/`, U+007F and U+2028, is written as raw UTF-8 (RFC 8785 § 3.2.2.2).
6. Arrays preserve element order.
7. NaN, Infinity, and strings or names containing an unpaired surrogate have no canonical form. An implementation MUST fail on them rather than write `null`, `Infinity` or a `\uD800`-style escape (RFC 8785 §§ 3.2.2.2 and 3.2.2.3).

Test vectors are in `fixtures/canonical-json-v1.json`: input and expected bytes in `cases`, and inputs that must fail in `error_cases`. Every rule above has at least one vector. Passing them all is necessary for byte-identical output across implementations, not sufficient.

## Artifact-type registry

The `artifact_type` enum is a closed set in v1.0. Adding a type requires a v1.1 MINOR schema bump (which keeps backward compat — old verifiers ignore unknown types).

| Type | Source | Schema version field meaning |
|---|---|---|
| `cert-l1-l4` | continuonai/rcan-spec conformance suite | rcan-spec spec version |
| `cert-gateway-authority` | robot-md-gateway tests/cert/ | gateway-authority report schema |
| `cert-hil-runtime` | rig owner + witness key | hil-runtime report schema |
| `eu-act-fria` | robot-md emit-fria | EU AI Act §22 packet schema |
| `eu-act-safety-benchmark` | robot-md emit-safety-benchmark | §23 |
| `eu-act-ifu` | robot-md emit-ifu | §24 |
| `eu-act-incident-report` | robot-md emit-incident-report | §25 |
| `eu-act-eu-register` | robot-md emit-eu-register | §26 |
| `version-tuple` | per-repo release CI | matrix-version |
| `version-matrix-snapshot` | opencastor-ops aggregator | matrix-version |

## What this bundle is not

- **Not a regulatory filing.** Per spec §10, RRF intake produces *evidence*; per-jurisdiction sufficiency is a separate question.
- **Not a certification.** Conformance is self-asserted; bundles enable independent replay, not third-party audit (spec §10).
- **Not a substitute for the artifacts.** A bundle without intact inner signatures is not a bundle.

## Verifying a bundle (recipe)

```python
from rcan.audit_bundle import VerifyMode, verify_bundle

result = verify_bundle(
    bundle_json,
    mode=VerifyMode.STRICT,
    kid_to_pem={"my-kid": pem_bytes},
)
# result.bundle_signature_ok: bool
# result.artifact_results: list[ArtifactVerificationResult]
# result.all_ok: bool
```

A `STRICT` verify resolves every inner kid against RRF (or a local key cache). An `AGGREGATOR_TRUST` verify only checks the bundle's outer signature.

## Future versions

- v1.1 — adds new `artifact_type` enum values; backward-compatible.
- v2.0 — adds ML-DSA hybrid algorithm in `signature.alg`; coordinates with rcan-spec crypto-profile decision.
