import { test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bundle from '../resources/default-prompts.json';
import { openDatabase } from '../src/main/db';
import { seed } from '../src/main/seed';
test('seed idempotent, exact Unicode bodies and reopen persistence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pochta-'));
  const path = join(dir, 'test.db');
  let db = openDatabase(path);
  seed(db, bundle);
  seed(db, bundle);
  expect(db.prepare('SELECT count(*) n FROM system_prompts').get()).toEqual({ n: 9 });
  for (const p of bundle.prompts)
    expect(db.prepare('SELECT body FROM system_prompts WHERE id=?').get(p.id)).toEqual({
      body: p.body,
    });
  db.close();
  db = openDatabase(path);
  expect(db.prepare('SELECT count(*) n FROM system_prompts').get()).toEqual({ n: 9 });
  db.close();
  rmSync(dir, { recursive: true });
});
