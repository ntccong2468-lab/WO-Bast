import type { Database } from 'better-sqlite3';
import type { SellerId } from '../../shared/contracts';
import type { Asset } from '../../shared/studio-contracts';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, open, writeFile, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
const LIMIT = 20 * 1024 * 1024;
export class AssetStore {
  constructor(
    private db: Database,
    private root: string,
  ) {}
  private async validate(bytes: Buffer) {
    if (bytes.length > LIMIT) throw new Error('Ảnh tối đa 20 MiB');
    let mime = '';
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      mime = 'image/png';
    else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg';
    else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
      mime = 'image/webp';
    if (!mime) throw new Error('Chỉ hỗ trợ PNG, JPEG, WebP hợp lệ');
    try {
      const image = sharp(bytes, { limitInputPixels: 40_000_000, animated: false });
      const info = await image.metadata();
      if (!info.width || !info.height || (info.pages ?? 1) > 1) throw new Error();
      await image.stats();
      return { mime, width: info.width, height: info.height };
    } catch {
      throw new Error('Ảnh lỗi hoặc vượt 40 megapixel');
    }
  }
  private async store(seller: SellerId, buffers: Buffer[]): Promise<Asset[]> {
    if (seller !== 'seller-a' && seller !== 'seller-b') throw new Error('Seller không hợp lệ');
    const metadata = await Promise.all(buffers.map((b) => this.validate(b)));
    await mkdir(this.root, { recursive: true });
    const assets = metadata.map((m, i) => ({
      ...m,
      id: randomUUID(),
      sha256: createHash('sha256').update(buffers[i]).digest('hex'),
      createdAt: new Date().toISOString(),
    }));
    try {
      for (let i = 0; i < assets.length; i++) {
        const path = join(this.root, assets[i].id);
        await writeFile(path + '.tmp', buffers[i], { flag: 'wx' });
        await rename(path + '.tmp', path);
      }
      this.db.transaction(() => {
        for (const a of assets)
          this.db
            .prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?)')
            .run(a.id, seller, a.mime, a.width, a.height, a.sha256, a.createdAt);
      })();
      return assets;
    } catch {
      await Promise.all(
        assets.flatMap((a) => [
          rm(join(this.root, a.id), { force: true }),
          rm(join(this.root, a.id) + '.tmp', { force: true }),
        ]),
      );
      throw new Error('Không thể lưu ảnh; lần nhập đã được hủy');
    }
  }
  async importFiles(seller: SellerId, paths: string[]) {
    if (!paths.length || paths.length > 6) throw new Error('Chọn từ 1 đến 6 ảnh');
    const buffers: Buffer[] = [];
    let total = 0;
    for (const path of paths) {
      const file = await open(path, 'r');
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > LIMIT) throw new Error('Ảnh tối đa 20 MiB');
        const bytes = Buffer.alloc(LIMIT + 1);
        let length = 0;
        while (length < bytes.length) {
          const r = await file.read(bytes, length, bytes.length - length, null);
          if (!r.bytesRead) break;
          length += r.bytesRead;
        }
        if (length > LIMIT) throw new Error('Ảnh tối đa 20 MiB');
        total += length;
        if (total > 60 * 1024 * 1024) throw new Error('Tổng ảnh tối đa 60 MiB');
        buffers.push(bytes.subarray(0, length));
      } finally {
        await file.close();
      }
    }
    return this.store(seller, buffers);
  }
  get(seller: SellerId, id: string): Asset {
    const row = this.db
      .prepare('SELECT * FROM assets WHERE seller_id=? AND id=?')
      .get(seller, id) as
      | {
          id: string;
          mime: string;
          width: number;
          height: number;
          sha256: string;
          created_at: string;
        }
      | undefined;
    if (!row) throw new Error('Không tìm thấy ảnh hoặc không có quyền');
    return {
      id: row.id,
      mime: row.mime,
      width: row.width,
      height: row.height,
      sha256: row.sha256,
      createdAt: row.created_at,
    };
  }
  list(seller: SellerId): Asset[] {
    return (
      this.db
        .prepare(
          `SELECT a.id FROM assets a WHERE a.seller_id=? AND NOT EXISTS (SELECT 1 FROM image_jobs j,json_each(j.data, '$.outputAssetIds') oa WHERE j.seller_id=a.seller_id AND oa.value=a.id) ORDER BY a.rowid DESC`,
        )
        .all(seller) as { id: string }[]
    ).map((r) => this.get(seller, r.id));
  }
  async read(seller: SellerId, id: string) {
    const a = this.get(seller, id);
    return readFile(join(this.root, a.id));
  }
  async thumbnail(seller: SellerId, id: string) {
    const bytes = await this.read(seller, id);
    return (
      'data:image/png;base64,' +
      (
        await sharp(bytes, { limitInputPixels: 40_000_000 })
          .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer()
      ).toString('base64')
    );
  }
  async preview(seller: SellerId, id: string) {
    const bytes = await this.read(seller, id);
    return (
      'data:image/png;base64,' +
      (
        await sharp(bytes, { limitInputPixels: 40_000_000 })
          .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer()
      ).toString('base64')
    );
  }
  async storeOutput(seller: SellerId, bytes: Buffer) {
    return (await this.store(seller, [bytes]))[0];
  }
}
