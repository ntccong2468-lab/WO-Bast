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
import { normalizeProductSize, resolveAspectRatio } from '../../shared/studio-ratios';
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
  values: z.record(z.string().max(100), z.string().max(5000)).optional().default({}),
  productSize: z.string().max(200).optional().default(''),
  aspectRatio: z.enum([
    '1:1',
    '2:3',
    '3:4',
    '4:5',
    '9:16',
    '3:2',
    '4:3',
    '16:9',
    '5:4',
    '21:9',
    'original',
  ]),
  aspectRatios: z
    .record(
      z.string().max(200),
      z.enum(['1:1', '2:3', '3:4', '4:5', '9:16', '3:2', '4:3', '16:9', '5:4', '21:9', 'original']),
    )
    .optional(),
  analysis: z
    .object({
      productTypeRu: z.string().max(500),
      colorsRu: z.array(z.string().max(200)).max(20),
      productNameRu: z.string().max(500),
      descriptionRu: z.string().max(3000),
      observedAttributesRu: z.array(z.string().max(500)).max(40),
      uncertainAttributesRu: z.array(z.string().max(500)).max(40),
      textProposals: z
        .array(
          z.object({
            assetIndex: z.number().int().min(0).max(5),
            role: z.enum(['hero', 'infographic', 'advertising', 'detail']),
            enabled: z.boolean(),
            approved: z.boolean(),
            titleRu: z.string().max(500),
            bodyRu: z.string().max(2000),
          }),
        )
        .max(6),
    })
    .optional(),
});
const baseline =
  'MANDATORY: Preserve the exact product identity, color, shape, logos and visible construction. Never invent hidden details or unverified attributes. If references are insufficient, request additional photos. Do not add prices, marketplace logos, certifications, text or watermarks. Infographic generation produces a text-free background only. A human seller must review the result.';
function escapeXml(value: string) {
  return value.replace(
    /[<>&'\"]/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character] ??
      character,
  );
}
function roleForMode(mode: string) {
  if (/hero|main/i.test(mode)) return 'hero';
  if (/info/i.test(mode)) return 'infographic';
  if (/advert|promo/i.test(mode)) return 'advertising';
  return 'detail';
}
async function renderApprovedText(bytes: Buffer, snapshot: PromptSnapshot) {
  const proposal = snapshot.textProposals?.find(
    (item) => item.enabled && item.approved && item.role === roleForMode(snapshot.image.mode),
  );
  if (!proposal) return bytes;
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height) throw new Error('invalid_response');
  const title = escapeXml(proposal.titleRu.slice(0, 160));
  const body = escapeXml(proposal.bodyRu.slice(0, 320));
  const size = Math.max(24, Math.round(metadata.width / 18));
  const bodySize = Math.max(16, Math.round(metadata.width / 30));
  const svg = `<svg width="${metadata.width}" height="${metadata.height}" xmlns="http://www.w3.org/2000/svg"><style>text{font-family:Arial,'DejaVu Sans',sans-serif;fill:#111827}.title{font-size:${size}px;font-weight:700}.body{font-size:${bodySize}px}</style><rect x="${Math.round(metadata.width * 0.05)}" y="${Math.round(metadata.height * 0.06)}" width="${Math.round(metadata.width * 0.9)}" height="${Math.round(metadata.height * 0.18)}" rx="18" fill="#ffffff" fill-opacity="0.88"/><text class="title" x="${Math.round(metadata.width * 0.08)}" y="${Math.round(metadata.height * 0.12)}">${title}</text><text class="body" x="${Math.round(metadata.width * 0.08)}" y="${Math.round(metadata.height * 0.18)}">${body}</text></svg>`;
  return sharp(bytes)
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .png()
    .toBuffer();
}
async function padToRatio(bytes: Buffer, ratio: string) {
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height) throw new Error('invalid_response');
  const [ratioWidth, ratioHeight] = ratio.split(':').map(Number);
  const maxDimension = Math.max(metadata.width, metadata.height);
  const targetWidth =
    ratioWidth >= ratioHeight
      ? maxDimension
      : Math.max(1, Math.round((maxDimension * ratioWidth) / ratioHeight));
  const targetHeight =
    ratioWidth >= ratioHeight
      ? Math.max(1, Math.round((maxDimension * ratioHeight) / ratioWidth))
      : maxDimension;
  return sharp(bytes)
    .resize({ width: targetWidth, height: targetHeight, fit: 'contain', background: '#ffffff' })
    .png()
    .toBuffer();
}
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
  'invalid_size',
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
    const first = this.assets.get(seller, r.assetIds[0]);
    const productSize = r.productSize ? normalizeProductSize(r.productSize) : '';
    const analysis = r.analysis ?? null;
    const resolve = (mode: string) => this.prompts.get(seller, defaults[mode] ?? mode);
    const master = resolve('system_product_master'),
      audit = resolve('image_quality_audit');
    if (master.category !== 'system' || audit.category !== 'quality')
      throw new Error('Prompt tổng hoặc kiểm định không đúng danh mục');
    return r.promptIds.map((id) => {
      const requestedAspectRatio = r.aspectRatios?.[id] ?? r.aspectRatio;
      const nativeAspectRatio = resolveAspectRatio(requestedAspectRatio, first.width, first.height);
      const outputAspectRatio =
        requestedAspectRatio === 'original' ? 'original' : nativeAspectRatio;
      const values = {
        ...r.values,
        ...(analysis
          ? {
              product_name: analysis.productNameRu,
              category: analysis.productTypeRu,
              verified_attributes: [...analysis.colorsRu, ...analysis.observedAttributesRu].join(
                ', ',
              ),
            }
          : {}),
        product_size: productSize,
        aspect_ratio: nativeAspectRatio,
        language: 'ru',
      };
      const image = this.prompts.get(seller, id);
      if (image.category !== 'image') throw new Error('Chọn prompt thuộc Tạo ảnh');
      const proposals = analysis?.textProposals ?? [];
      const approvedForTask = proposals.filter(
        (proposal) =>
          proposal.enabled && proposal.approved && proposal.role === roleForMode(image.mode),
      );
      const textInstruction = approvedForTask.length
        ? approvedForTask
            .map(
              (proposal) =>
                `Controlled Russian text for ${proposal.role}: ${proposal.titleRu}${proposal.bodyRu ? ` — ${proposal.bodyRu}` : ''}. Render only this text if legible; never invent additional text.`,
            )
            .join('\n')
        : 'Do not add text, labels, prices, watermarks or decorative typography.';
      const merged = interpolate(
        [baseline, textInstruction, master.body, image.body].join('\n\n'),
        values,
      );
      const auditPreview = interpolate(audit.body, values);
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
        values,
        productSize,
        finalPrompt: merged.text,
        aspectRatio: requestedAspectRatio,
        outputAspectRatio,
        sourceWidth: first.width,
        sourceHeight: first.height,
        analysis,
        textProposals: proposals,
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
        bytes = await renderApprovedText(bytes, job.snapshot);
        const native = await this.assets.storeOutput(seller, bytes);
        job = this.update(seller, job, { outputAssetIds: [native.id] });
        const outputAspectRatio = (job.snapshot.outputAspectRatio ??
          job.snapshot.aspectRatio) as PromptSnapshot['outputAspectRatio'];
        if (outputAspectRatio !== '2:3') {
          const output = await this.assets.storeOutput(
            seller,
            await padToRatio(
              bytes,
              outputAspectRatio === 'original'
                ? `${job.snapshot.sourceWidth}:${job.snapshot.sourceHeight}`
                : outputAspectRatio,
            ),
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
      const output = await this.assets.read(seller, job.outputAssetIds.at(-1)!);
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
