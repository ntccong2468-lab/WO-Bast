import { test, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase } from '../src/main/db';
import { seed } from '../src/main/seed';
import bundle from '../resources/default-prompts.json';
import { PromptService } from '../src/main/prompt-service';
let db: ReturnType<typeof openDatabase>;
let s: PromptService;
const input = {
  name: 'Áo mùa đông',
  nameRu: 'Зима',
  description: 'Mô tả',
  category: 'image' as const,
  body: 'Привет {{product_name}}',
  tags: ['áo'],
  group: 'Thời trang',
  mode: 'hero',
};
beforeEach(() => {
  db = openDatabase(':memory:');
  seed(db, bundle);
  s = new PromptService(db);
});
afterEach(() => db.close());
test('seller A owns every operation; B cannot use a foreign id', () => {
  const p = s.create('seller-a', input);
  expect(s.list('seller-b')).toHaveLength(9);
  for (const operation of [
    () => s.get('seller-b', p.id),
    () => s.save('seller-b', p.id, input),
    () => s.clone('seller-b', p.id),
    () => s.remove('seller-b', p.id),
    () => s.versions('seller-b', p.id),
    () => s.restore('seller-b', p.id, 1),
    () => s.reset('seller-b', p.id),
    () => s.favorite('seller-b', p.id, true),
    () => s.setDefault('seller-b', 'hero', p.id),
    () => s.markUsed('seller-b', p.id),
  ])
    expect(operation).toThrow();
  expect(() => s.remove('seller-a', 'hero_image')).toThrow();
});
test('system edit creates one override; restore and reset append complete snapshots', () => {
  const p = s.save('seller-a', 'hero_image', input);
  expect(p.source).toBe('seller');
  expect(s.get('seller-b', 'hero_image').body).toBe(bundle.prompts[1].body);
  const p2 = s.save('seller-a', 'hero_image', { ...input, name: 'New', body: 'New body' });
  expect(p2.id).toBe(p.id);
  expect(p2.version).toBe(2);
  const restored = s.restore('seller-a', p.id, 1);
  expect(restored.name).toBe(input.name);
  expect(restored.version).toBe(3);
  const reset = s.reset('seller-a', p.id);
  expect(reset.body).toBe(bundle.prompts[1].body);
  expect(s.versions('seller-a', p.id)).toHaveLength(4);
  expect(s.save('seller-b', 'hero_image', input).id).not.toBe(p.id);
});
test('preferences, defaults and use metadata are private and delete clears references', () => {
  const p = s.create('seller-a', input);
  s.favorite('seller-a', p.id, true);
  s.setDefault('seller-a', 'hero', p.id);
  s.markUsed('seller-a', p.id);
  expect(s.get('seller-a', p.id).isFavorite).toBe(true);
  expect(s.get('seller-a', p.id).lastUsedAt).toBeTruthy();
  expect(s.defaults('seller-b')).toEqual({});
  s.remove('seller-a', p.id);
  expect(s.defaults('seller-a')).toEqual({});
});
test('seed upgrade preserves personal changes and version history', () => {
  const p = s.save('seller-a', 'hero_image', input);
  const next = structuredClone(bundle);
  next.prompts[1].version = 2;
  next.prompts[1].body = 'Updated system';
  seed(db, next);
  expect(s.get('seller-a', p.id).body).toBe(input.body);
  expect(s.versions('seller-a', p.id)).toHaveLength(1);
  expect(s.get('seller-b', 'hero_image').body).toBe('Updated system');
});
test('invalid data cannot create or partly update a prompt', () => {
  expect(() => s.create('seller-a', { ...input, name: '' })).toThrow();
  expect(() => s.create('seller-a', { ...input, body: 'x'.repeat(50001) })).toThrow();
  expect(s.list('seller-a')).toHaveLength(9);
  const p = s.create('seller-a', input);
  const clone = s.clone('seller-a', p.id);
  expect(clone.body).toBe(p.body);
  expect(clone.id).not.toBe(p.id);
});
