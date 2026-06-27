-- Migration 005: RCN / RMN / RHN sibling registries
-- Components (parts), Models (AI models), Harnesses (runtimes) — mirror the
-- robots/RRN table (numeric zero-padded id minted from the autoincrement id,
-- api-key-on-create, soft delete). Idempotent — safe to run multiple times.

-- ── RCN — Registry Component Number (physical parts) ──────────────────────────
CREATE TABLE IF NOT EXISTS components (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  rcn               TEXT    UNIQUE,            -- RCN-000000000042 (set after insert)
  manufacturer      TEXT    NOT NULL,
  model             TEXT    NOT NULL,          -- e.g. STS3215, OAK-D
  serial            TEXT    NOT NULL,          -- distinguishes a physical instance
  uri               TEXT    NOT NULL,          -- rcan://rcan.dev/c/<mfr>/<model>/<serial>
  verification_tier TEXT    NOT NULL DEFAULT 'community',
  category          TEXT    DEFAULT '',        -- servo | camera | compute | end-effector | firmware
  firmware_hash     TEXT    DEFAULT '',
  spec_url          TEXT    DEFAULT '',
  description       TEXT    DEFAULT '',
  contact_email     TEXT    DEFAULT '',
  source            TEXT    DEFAULT '',
  api_key_hash      TEXT,
  registered_at     TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL,
  deleted           INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_components_identity ON components(manufacturer, model, serial) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_components_rcn ON components(rcn);
CREATE INDEX IF NOT EXISTS idx_components_active ON components(deleted, registered_at DESC);

-- ── RMN — Registry Model Number (AI models + versions) ────────────────────────
CREATE TABLE IF NOT EXISTS models (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  rmn               TEXT    UNIQUE,            -- RMN-000000000007
  provider          TEXT    NOT NULL,          -- anthropic | openvla | ...
  model             TEXT    NOT NULL,          -- claude-opus-4-7 | openvla-7b
  version           TEXT    NOT NULL,          -- 4-7 | 2026-w24
  uri               TEXT    NOT NULL,          -- rcan://rcan.dev/m/<provider>/<model>/<version>
  verification_tier TEXT    NOT NULL DEFAULT 'community',
  modality          TEXT    DEFAULT '',        -- llm | vla | perception | control
  weights_sha256    TEXT    DEFAULT '',        -- when known (closed models: blank, honest)
  eval_url          TEXT    DEFAULT '',        -- eval/model card of record
  description       TEXT    DEFAULT '',
  contact_email     TEXT    DEFAULT '',
  source            TEXT    DEFAULT '',
  api_key_hash      TEXT,
  registered_at     TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL,
  deleted           INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_models_identity ON models(provider, model, version) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_models_rmn ON models(rmn);
CREATE INDEX IF NOT EXISTS idx_models_active ON models(deleted, registered_at DESC);

-- ── RHN — Registry Harness Number (runtimes / harness builds) ─────────────────
CREATE TABLE IF NOT EXISTS harnesses (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  rhn               TEXT    UNIQUE,            -- RHN-000000000003
  name              TEXT    NOT NULL,          -- opencastor | robot-md-gateway | claude-code
  version           TEXT    NOT NULL,          -- 2026-3
  uri               TEXT    NOT NULL,          -- rcan://rcan.dev/h/<name>/<version>
  verification_tier TEXT    NOT NULL DEFAULT 'community',
  repo              TEXT    DEFAULT '',
  build_hash        TEXT    DEFAULT '',
  capabilities      TEXT    DEFAULT '',
  description       TEXT    DEFAULT '',
  contact_email     TEXT    DEFAULT '',
  source            TEXT    DEFAULT '',
  api_key_hash      TEXT,
  registered_at     TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL,
  deleted           INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_harnesses_identity ON harnesses(name, version) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_harnesses_rhn ON harnesses(rhn);
CREATE INDEX IF NOT EXISTS idx_harnesses_active ON harnesses(deleted, registered_at DESC);
