import { test, expect } from 'vitest';
import { dispatchStudio } from '../src/main/studio/ipc';
test('rejects untrusted senders, raw filesystem paths and forged states before service calls', async () => {
  const ctx = {} as any;
  await expect(dispatchStudio(ctx, 'seller-a', false, 'list', [])).rejects.toThrow();
  await expect(
    dispatchStudio(ctx, 'seller-a', true, 'readFile', ['/etc/passwd']),
  ).rejects.toThrow();
  await expect(
    dispatchStudio(ctx, 'seller-a', true, 'create', [
      {
        assetIds: ['a'],
        promptIds: ['hero_image'],
        values: {},
        aspectRatio: '3:4',
        state: 'approved',
      },
    ]),
  ).rejects.toThrow();
  await expect(
    dispatchStudio(ctx, 'seller-a', true, 'review', ['job', 'approve', 'yes']),
  ).rejects.toThrow();
  await expect(dispatchStudio(ctx, 'seller-a', true, 'credentialSave', [{}])).rejects.toThrow();
});
