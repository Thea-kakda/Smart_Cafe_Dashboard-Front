import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERMISSIONS } from '../lib/permissionCodes';
import { PERMISSION_CATALOG } from './fixtures/permissionCatalog';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const catalog = new Set(PERMISSION_CATALOG);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'tests' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** Literal codes passed to hasPermission(...) or listed in anyPermission: [...]. */
function guardedCodes(): { file: string; code: string }[] {
  const found: { file: string; code: string }[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(SRC, file);
    for (const m of text.matchAll(/hasPermission\(\s*'([^']+)'\s*\)/g)) found.push({ file: rel, code: m[1] });
    for (const m of text.matchAll(/anyPermission:\s*\[([^\]]*)\]/g)) {
      for (const c of m[1].matchAll(/'([^']+)'/g)) found.push({ file: rel, code: c[1] });
    }
  }
  return found;
}

describe('Permission code contract (frontend vs identity.permissions)', () => {
  it('every PERMISSIONS constant exists in the backend catalog', () => {
    for (const code of Object.values(PERMISSIONS)) {
      assert.ok(catalog.has(code), `PERMISSIONS value "${code}" is not a backend permission code`);
    }
  });

  it('every literal hasPermission / anyPermission code exists in the backend catalog', () => {
    const codes = guardedCodes();
    assert.ok(codes.length > 0, 'scanner found no permission guards');
    const unknown = codes.filter((c) => !catalog.has(c.code));
    assert.deepStrictEqual(unknown, [], `unknown permission codes: ${JSON.stringify(unknown)}`);
  });

  it('the production queue code is the hyphenated backend form', () => {
    assert.strictEqual(PERMISSIONS.PRODUCTION_QUEUE_READ, 'production:queue-read');
    const typo = sourceFiles(SRC).filter((f) => readFileSync(f, 'utf8').includes('production:queue:read'));
    assert.deepStrictEqual(typo.map((f) => relative(SRC, f)), []);
  });

  it('dashboard widgets never gate on role names', () => {
    for (const rel of ['components/views/OverviewView.tsx', 'components/dashboard/DashboardSummaryCards.tsx', 'context/ProductionContext.tsx']) {
      const text = readFileSync(join(SRC, rel), 'utf8');
      assert.ok(!/SUPER_ADMIN|'ADMIN'/.test(text), `${rel} must rely on permissions, not role names`);
    }
  });
});
