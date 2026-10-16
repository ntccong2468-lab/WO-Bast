import { expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../src/main/migrations';
import { ProductProfileStore } from '../src/main/studio/profiles';

test('size profile is isolated per seller and survives the new migration', () => {
  const db = new Database(':memory:');
  migrate(db);
  const profiles = new ProductProfileStore(db);
  expect(profiles.get('seller-a')).toMatchObject({ productSize: '' });
  profiles.save('seller-a', '48-56; M; One Size');
  expect(profiles.get('seller-a').productSize).toBe('48-56; M; One Size');
  profiles.save('seller-a', '');
  expect(profiles.get('seller-a').productSize).toBe('');
  expect(profiles.get('seller-b').productSize).toBe('');
  expect(db.pragma('user_version', { simple: true })).toBe(3);
  db.close();
});
