import { test, expect } from 'vitest';
import sharp from 'sharp';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/main/db';
import { AssetStore } from '../src/main/studio/assets';
test('valid formats preserve bytes; seller B cannot read A; malformed batch leaves no outputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'assets-'));
  const db = openDatabase(':memory:');
  const store = new AssetStore(db, join(root, 'store'));
  try {
    for (const format of ['png', 'jpeg', 'webp'] as const) {
      const bytes = await sharp({
        create: { width: 16, height: 12, channels: 3, background: 'white' },
      })
        .toFormat(format)
        .toBuffer();
      const file = join(root, 'image.' + format);
      await writeFile(file, bytes);
      const [asset] = await store.importFiles('seller-a', [file]);
      expect(await store.read('seller-a', asset.id)).toEqual(bytes);
      expect(asset.width).toBe(16);
      expect(await store.thumbnail('seller-a', asset.id)).toMatch(/^data:image\/png;base64,/);
      expect(() => store.get('seller-b', asset.id)).toThrow();
    }
    const before = await readdir(join(root, 'store'));
    await writeFile(join(root, 'bad.png'), 'not an image');
    await expect(
      store.importFiles('seller-a', [join(root, 'image.png'), join(root, 'bad.png')]),
    ).rejects.toThrow();
    expect(await readdir(join(root, 'store'))).toEqual(before);
    await expect(
      store.importFiles('seller-a', Array(7).fill(join(root, 'image.png'))),
    ).rejects.toThrow();
    const oversized = join(root, 'large.png');
    await writeFile(oversized, Buffer.alloc(20 * 1024 * 1024 + 1));
    await expect(store.importFiles('seller-a', [oversized])).rejects.toThrow();
  } finally {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
test('large review preview is ownership checked and bounded', async () => {
  const root = await mkdtemp(join(tmpdir(), 'preview-'));
  const db = openDatabase(':memory:');
  try {
    const store = new AssetStore(db, root);
    const image = await sharp({
      create: { width: 1800, height: 2400, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    const asset = await store.storeOutput('seller-a', image);
    await expect(store.preview('seller-b', asset.id)).rejects.toThrow();
    const url = await store.preview('seller-a', asset.id);
    const meta = await sharp(Buffer.from(url.split(',')[1], 'base64')).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(1600);
  } finally {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
