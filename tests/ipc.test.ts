import { test, expect } from 'vitest';
import { openDatabase } from '../src/main/db';
import { seed } from '../src/main/seed';
import bundle from '../resources/default-prompts.json';
import { PromptService } from '../src/main/prompt-service';
import { Session } from '../src/main/session';
import { dispatch } from '../src/main/ipc';
test('dispatcher rejects untrusted sender, methods, invalid seller and invalid payload', () => {
  const db = openDatabase(':memory:');
  seed(db, bundle);
  const service = new PromptService(db),
    session = new Session();
  const call = (method: string, args: unknown[] = [], trusted = true) =>
    dispatch({ db, service, session }, trusted, method, args);
  expect(() => call('list', [], false)).toThrow();
  expect(() => call('exec', ['DROP TABLE system_prompts'])).toThrow();
  expect(() => call('switchSeller', ['seller-c'])).toThrow();
  expect(() => call('get', [{}])).toThrow();
  expect(() => call('save', ['hero_image', {}])).toThrow();
  expect(() => call('setDirty', ['yes'])).toThrow();
  call('switchSeller', ['seller-b']);
  expect(call('session')).toEqual({ seller: 'seller-b' });
  expect(call('list')).toHaveLength(9);
  db.close();
});
