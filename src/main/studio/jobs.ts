import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import type { SellerId, Prompt } from '../../shared/contracts';
import type {
  CreateStudioRequest,
  PromptSnapshot,
  StudioJob,
  QualityReport,
} from '../../shared/studio-contracts';
import { PromptService, inputSchema } from '../prompt-service';
import { AssetStore } from './assets';
import { interpolate } from '../../shared/interpolation';
export interface StudioProvider {
  generate(snapshot: PromptSnapshot, inputs: Buffer[], signal: AbortSignal): Promise<Buffer>;
  audit(
    snapshot: PromptSnapshot,
    inputs: Buffer[],
    output: Buffer,
    signal: AbortSignal,
  ): Promise<QualityReport>;
}
const finding = z.object({
  description: z.string().max(2000),
  confidence: z.number().min(0).max(1),
});
export const qualitySchema = z.object({
  passed: z.array(finding).max(40),
  errors: z.array(finding).max(40),
  verdict: z.enum(['pass', 'manual_review', 'fail']),
  repairPrompt: z.string().max(10000),
});
export const requestSchema = z.object({
  assetIds: z.array(z.string().min(1).max(200)).min(1).max(6),
  promptIds: z.array(z.string().min(1).max(200)).min(1).max(7),
  values: z.record(z.string().max(100), z.string().max(5000)),
  aspectRatio: z.enum(['3:4', '2:3']),
});
const baseline =
  'MANDATORY: Preserve the exact product identity, color, shape, logos and visible construction. Never invent hidden details or unverified attributes. If references are insufficient, request additional photos. Do not add prices, marketplace logos, certifications, text or watermarks. Infographic generation produces a text-free background only. A human seller must review the result.';
const allowedCodes = [
  'credential_missing',
  'credential_unavailable',
  'invalid_api_key',
  'access_denied',
  'quota',
  'rate_limited',
  'timeout',
  'network',
  'invalid_response',
  'refused',
  'disk_error',
  'model_unavailable',
  'invalid_prompt',
];
export function safeCode(e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  return allowedCodes.includes(msg) ? msg : 'unexpected_error';
}
export class StudioJobs {
  private running = false;
  constructor(
    private db: Database,
    private prompts: PromptService,
    private assets: AssetStore,
    private providerFor: (seller: SellerId) => StudioProvider,
  ) {}
  prepare(seller: SellerId, raw: CreateStudioRequest): PromptSnapshot[] {
    const r = requestSchema.parse(raw);
    if (
      new Set(r.promptIds).size !== r.promptIds.length ||
      new Set(r.assetIds).size !== r.assetIds.length
    )
      throw new Error('Không chọn trùng ảnh hoặc prompt');
    if (
      r.assetIds.reduce((total, id) => total + this.assets.byteLength(seller, id), 0) >
      60 * 1024 * 1024
    )
      throw new Error('Tổng ảnh đã chọn vượt 60 MiB');
    const defaults = this.prompts.defaults(seller);
    const resolve = (mode: string) => this.prompts.get(seller, defaults[mode] ?? mode);
    const master = resolve('system_product_master'),
      audit = resolve('image_quality_audit');
    if (master.category !== 'system' || audit.category !== 'quality')
      throw new Error('Prompt tổng hoặc kiểm định không đúng danh mục');
    return r.promptIds.map((id) => {
      const image = this.prompts.get(seller, id);
      if (image.category !== 'image') throw new Error('Chọn prompt thuộc Tạo ảnh');
      const merged = interpolate([baseline, master.body, image.body].join('\n\n'), r.values);
      const auditPreview = interpolate(audit.body, r.values);
      if (
        merged.missing.length ||
        merged.unsupported.length ||
        auditPreview.missing.length ||
        auditPreview.unsupported.length
      )
        throw new Error(
          'Thiếu hoặc không hỗ trợ biến: ' +
            [
              ...new Set([
                ...merged.missing,
                ...merged.unsupported,
                ...auditPreview.missing,
                ...auditPreview.unsupported,
              ]),
            ].join(', '),
        );
      return {
        master: inputSchema.parse(master),
        image: inputSchema.parse(image),
        audit: inputSchema.parse({ ...audit, body: auditPreview.text }),
        ids: [master.id, image.id, audit.id],
        versions: [master.version, image.version, audit.version],
        values: r.values,
        finalPrompt: merged.text,
        aspectRatio: r.aspectRatio,
      };
    });
  }
  create(seller: SellerId, request: CreateStudioRequest) {
    const snapshots = this.prepare(seller, request),
      batchId = randomUUID(),
      now = new Date().toISOString();
    return this.db.transaction(() =>
      snapshots.map((snapshot) => {
        const job: StudioJob = {
          id: randomUUID(),
          batchId,
          state: 'queued',
          snapshot,
          originalAssetIds: [...request.assetIds],
          outputAssetIds: [],
          qualityReport: null,
          errorCode: null,
          createdAt: now,
          updatedAt: now,
          reviewedAt: null,
        };
        this.db
          .prepare('INSERT INTO image_jobs VALUES(?,?,?)')
          .run(job.id, seller, JSON.stringify(job));
        return job;
      }),
    )();
  }
  list(seller: SellerId): StudioJob[] {
    this.prompts.defaults(seller);
    return (
      this.db
        .prepare('SELECT data FROM image_jobs WHERE seller_id=? ORDER BY rowid DESC')
        .all(seller) as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  get(seller: SellerId, id: string): StudioJob {
    const row = this.db
      .prepare('SELECT data FROM image_jobs WHERE seller_id=? AND id=?')
      .get(seller, id) as { data: string } | undefined;
    if (!row) throw new Error('Không tìm thấy tác vụ hoặc không có quyền');
    return JSON.parse(row.data);
  }
  private update(seller: SellerId, job: StudioJob, patch: Partial<StudioJob>) {
    const updated = { ...job, ...patch, updatedAt: new Date().toISOString() };
    this.db
      .prepare('UPDATE image_jobs SET data=? WHERE seller_id=? AND id=?')
      .run(JSON.stringify(updated), seller, job.id);
    return updated;
  }
  async run(seller: SellerId, id: string) {
    let job = this.get(seller, id);
    if (job.state !== 'queued') throw new Error('Tác vụ không ở hàng chờ');
    if (this.running) throw new Error('Đang có tác vụ khác chạy');
    this.running = true;
    job = this.update(seller, job, { state: 'generating' });
    try {
      let inputs: Buffer[];
      try {
        inputs = await Promise.all(job.originalAssetIds.map((id) => this.assets.read(seller, id)));
        if (inputs.reduce((total, b) => total + b.length, 0) > 60 * 1024 * 1024)
          throw new Error('input_too_large');
      } catch {
        this.update(seller, job, { state: 'failed', errorCode: 'disk_error' });
        return;
      }
      let bytes: Buffer;
      try {
        bytes = await this.providerFor(seller).generate(
          job.snapshot,
          inputs,
          AbortSignal.timeout(180000),
        );
        const native = await this.assets.storeOutput(seller, bytes);
        job = this.update(seller, job, { outputAssetIds: [native.id] });
        if (job.snapshot.aspectRatio === '3:4') {
          const meta = await sharp(bytes).metadata();
          if (!meta.width || !meta.height) throw new Error('invalid_response');
          const targetWidth = Math.max(meta.width, Math.ceil((meta.height * 3) / 4)),
            targetHeight = Math.max(meta.height, Math.ceil((targetWidth * 4) / 3));
          const output = await this.assets.storeOutput(
            seller,
            await sharp(bytes)
              .extend({
                left: Math.floor((targetWidth - meta.width) / 2),
                right: Math.ceil((targetWidth - meta.width) / 2),
                top: Math.floor((targetHeight - meta.height) / 2),
                bottom: Math.ceil((targetHeight - meta.height) / 2),
                background: '#ffffff',
              })
              .png()
              .toBuffer(),
          );
          job = this.update(seller, job, { outputAssetIds: [native.id, output.id] });
        }
      } catch (e) {
        const code = safeCode(e);
        this.update(seller, job, {
          state: ['timeout', 'network'].includes(code) ? 'uncertain' : 'failed',
          errorCode: code,
        });
        return;
      }
      await this.audit(seller, job, inputs);
    } finally {
      this.running = false;
    }
  }
  private async audit(seller: SellerId, job: StudioJob, inputs?: Buffer[]) {
    job = this.update(seller, job, { state: 'auditing', errorCode: null });
    try {
      const originals =
        inputs ??
        (await Promise.all(job.originalAssetIds.map((id) => this.assets.read(seller, id))));
      const output = await this.assets.read(seller, job.outputAssetIds[0]);
      const report = qualitySchema.parse(
        await this.providerFor(seller).audit(
          job.snapshot,
          originals,
          output,
          AbortSignal.timeout(180000),
        ),
      );
      this.update(seller, job, { state: 'awaiting_review', qualityReport: report });
    } catch (e) {
      this.update(seller, job, { state: 'audit_failed', errorCode: safeCode(e) });
    }
  }
  async retryAudit(seller: SellerId, id: string) {
    const job = this.get(seller, id);
    if (job.state !== 'audit_failed' || !job.outputAssetIds.length)
      throw new Error('Không thể kiểm định lại tác vụ này');
    if (this.running) throw new Error('Đang có tác vụ khác chạy');
    this.running = true;
    try {
      await this.audit(seller, job);
    } finally {
      this.running = false;
    }
  }
  review(seller: SellerId, id: string, decision: 'approve' | 'reject', confirmManual: boolean) {
    const job = this.get(seller, id);
    if (job.state !== 'awaiting_review' || !job.qualityReport)
      throw new Error('Tác vụ chưa sẵn sàng duyệt');
    if (decision !== 'approve' && decision !== 'reject') throw new Error('Lựa chọn không hợp lệ');
    if (
      decision === 'approve' &&
      (job.qualityReport.verdict === 'fail' ||
        (job.qualityReport.verdict === 'manual_review' && !confirmManual))
    )
      throw new Error('Kiểm định không đạt hoặc cần xác nhận thủ công');
    return this.update(seller, job, {
      state: decision === 'approve' ? 'approved' : 'rejected',
      reviewedAt: new Date().toISOString(),
    });
  }
  cancelQueued(seller: SellerId, batchId: string) {
    const jobs = this.list(seller).filter((j) => j.batchId === batchId);
    if (!jobs.length) throw new Error('Không có quyền truy cập bộ ảnh');
    for (const job of jobs)
      if (job.state === 'queued') this.update(seller, job, { state: 'rejected' });
  }
  recover() {
    for (const seller of ['seller-a', 'seller-b'] as const)
      for (const job of this.list(seller))
        if (job.state === 'generating' || job.state === 'auditing')
          this.update(seller, job, {
            state: job.state === 'generating' ? 'uncertain' : 'audit_failed',
            errorCode: 'interrupted',
          });
  }
}
