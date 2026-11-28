import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'schemas');
const PUB_DIR = join(ROOT, 'public', 'schemas');

function collectJsonFiles(dir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const sub = rel ? join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === 'examples') continue;
      out.push(...collectJsonFiles(join(dir, entry.name), sub));
    } else if (entry.name.endsWith('.json')) {
      out.push(sub);
    }
  }
  return out.sort();
}

describe('schemas/ vs public/schemas/ parity', () => {
  const schemaFiles = collectJsonFiles(SRC_DIR);

  it('publishes every schema in schemas/ and schemas/messages/ with identical JSON', () => {
    expect(schemaFiles.length).toBeGreaterThanOrEqual(15);
    for (const rel of schemaFiles) {
      const srcPath = join(SRC_DIR, rel);
      const pubPath = join(PUB_DIR, rel);
      expect(existsSync(pubPath), `Missing published schema: public/schemas/${rel}`).toBe(true);
      const srcJson = JSON.parse(readFileSync(srcPath, 'utf8'));
      const pubJson = JSON.parse(readFileSync(pubPath, 'utf8'));
      expect(pubJson, `Schema drift detected in ${rel}`).toEqual(srcJson);
    }
  });
});
