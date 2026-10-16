import { test, expect } from 'vitest';
import sharp from 'sharp';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../src/main/db';
import { seed } from '../src/main/seed';
import bundle from '../resources/default-prompts.json';
import { PromptService } from '../src/main/prompt-service';
import { AssetStore } from '../src/main/studio/assets';
import { StudioJobs, type StudioProvider } from '../src/main/studio/jobs';
const report = {
  passed: [{ description: 'Matched', confidence: 0.8 }],
  errors: [],
  verdict: 'pass' as const,
  repairPrompt: '',
};
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'jobs-'));
  const db = openDatabase(':memory:');
  seed(db, bundle);
  const prompts = new PromptService(db),
    assets = new AssetStore(db, root);
  const bytes = await sharp({ create: { width: 12, height: 16, channels: 3, background: 'white' } })
    .png()
    .toBuffer();
  const asset = await assets.storeOutput('seller-a', bytes);
  let generated = 0,
    audited = 0;
  const provider: StudioProvider = {
    generate: async () => {
      generated++;
      return bytes;
    },
    audit: async () => {
      audited++;
      return report;
    },
  };
  const jobs = new StudioJobs(db, prompts, assets, () => provider);
  const request = {
    assetIds: [asset.id],
    promptIds: ['hero_image'],
    values: {},
    aspectRatio: '3:4' as const,
  };
  return {
    db,
    prompts,
    assets,
    jobs,
    provider,
    request,
    counts: () => ({ generated, audited }),
    cleanup: async () => {
      db.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
test('snapshot, generation, audit, manual review, output and seller isolation', async () => {
  const x = await setup();
  try {
    expect(() => x.jobs.create('seller-b', x.request)).toThrow();
    expect(() =>
      x.jobs.create('seller-a', { ...x.request, promptIds: ['image_quality_audit'] }),
    ).toThrow();
    const [job] = x.jobs.create('seller-a', x.request);
    expect(() => x.jobs.get('seller-b', job.id)).toThrow();
    expect(() => x.jobs.review('seller-a', job.id, 'approve', true)).toThrow();
    await x.jobs.run('seller-a', job.id);
    const ready = x.jobs.get('seller-a', job.id);
    expect(ready.state).toBe('awaiting_review');
    expect(ready.outputAssetIds).toHaveLength(2);
    const exported = x.assets.get('seller-a', ready.outputAssetIds[1]);
    expect([exported.width, exported.height]).toEqual([12, 16]);
    expect(x.jobs.review('seller-a', job.id, 'approve', false).state).toBe('approved');
    expect(x.jobs.list('seller-b')).toEqual([]);
    expect(x.counts()).toEqual({ generated: 1, audited: 1 });
  } finally {
    await x.cleanup();
  }
});
test('audit failure keeps output and retries audit only; failed audits cannot be approved', async () => {
  const x = await setup();
  try {
    x.provider.audit = async () => {
      throw new Error('secret should not appear');
    };
    const [j] = x.jobs.create('seller-a', x.request);
    await x.jobs.run('seller-a', j.id);
    expect(x.jobs.get('seller-a', j.id).state).toBe('audit_failed');
    expect(JSON.stringify(x.jobs.get('seller-a', j.id))).not.toContain('secret should');
    x.provider.audit = async () => ({ ...report, verdict: 'fail' });
    await x.jobs.retryAudit('seller-a', j.id);
    expect(() => x.jobs.review('seller-a', j.id, 'approve', true)).toThrow();
    expect(x.counts().generated).toBe(1);
    x.provider.audit = async () => ({ ...report, verdict: 'manual_review' });
    const [j2] = x.jobs.create('seller-a', x.request);
    await x.jobs.run('seller-a', j2.id);
    expect(() => x.jobs.review('seller-a', j2.id, 'approve', false)).toThrow();
    expect(x.jobs.review('seller-a', j2.id, 'approve', true).state).toBe('approved');
  } finally {
    await x.cleanup();
  }
});
test('timeout is uncertain, does not retry, recover never submits queued jobs', async () => {
  const x = await setup();
  try {
    x.provider.generate = async () => {
      throw new Error('timeout');
    };
    const [j] = x.jobs.create('seller-a', x.request);
    await x.jobs.run('seller-a', j.id);
    expect(x.jobs.get('seller-a', j.id).state).toBe('uncertain');
    await expect(x.jobs.run('seller-a', j.id)).rejects.toThrow();
    const [queued] = x.jobs.create('seller-a', x.request);
    x.jobs.recover();
    expect(x.jobs.get('seller-a', queued.id).state).toBe('queued');
    expect(() => x.jobs.cancelQueued('seller-b', queued.batchId)).toThrow();
    x.jobs.cancelQueued('seller-a', queued.batchId);
    expect(x.jobs.get('seller-a', queued.id).state).toBe('rejected');
  } finally {
    await x.cleanup();
  }
});
test('snapshot survives prompt deletion; missing variables and duplicate ids reject before queue', async () => {
  const x = await setup();
  try {
    const p = x.prompts.clone('seller-a', 'hero_image');
    x.prompts.save('seller-a', p.id, { ...p, body: 'Name {{product_name}}' });
    expect(() => x.jobs.create('seller-a', { ...x.request, promptIds: [p.id] })).toThrow();
    const [j] = x.jobs.create('seller-a', {
      ...x.request,
      promptIds: [p.id],
      values: { product_name: 'Áo' },
    });
    x.prompts.remove('seller-a', p.id);
    expect(x.jobs.get('seller-a', j.id).snapshot.finalPrompt).toContain('Name Áo');
    expect(() =>
      x.jobs.create('seller-a', { ...x.request, promptIds: ['hero_image', 'hero_image'] }),
    ).toThrow();
  } finally {
    await x.cleanup();
  }
});
test('a claimed job is no longer cancellable while source files are being read', async () => {
  const x = await setup();
  try {
    const read = x.assets.read.bind(x.assets);
    let release: () => void = () => {};
    let first = true;
    x.assets.read = async (s, id) => {
      if (first) {
        first = false;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return read(s, id);
    };
    const [j] = x.jobs.create('seller-a', x.request);
    const running = x.jobs.run('seller-a', j.id);
    expect(x.jobs.get('seller-a', j.id).state).toBe('generating');
    x.jobs.cancelQueued('seller-a', j.batchId);
    release();
    await running;
    expect(x.jobs.get('seller-a', j.id).state).toBe('awaiting_review');
  } finally {
    await x.cleanup();
  }
});
test('separate imports cannot bypass the selected-input 60 MiB limit', async () => {
  const x = await setup();
  try {
    const small = await x.assets.read('seller-a', x.request.assetIds[0]);
    const padded = Buffer.concat([small, Buffer.alloc(11 * 1024 * 1024)]);
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push((await x.assets.storeOutput('seller-a', padded)).id);
    expect(() => x.jobs.create('seller-a', { ...x.request, assetIds: ids })).toThrow();
    expect(x.counts().generated).toBe(0);
  } finally {
    await x.cleanup();
  }
});
