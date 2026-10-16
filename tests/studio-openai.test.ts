import { test, expect } from 'vitest';
import sharp from 'sharp';
import { OpenAIStudioAdapter } from '../src/main/studio/openai-adapter';
import type { PromptSnapshot } from '../src/shared/studio-contracts';
const snapshot = {
  finalPrompt: 'Preserve reference product',
  audit: { body: 'Compare originals' },
  aspectRatio: '3:4',
} as PromptSnapshot;
const keys = { resolve: () => 'fixture-key' };
test('official SDK sends actual multipart bytes and structured original/output images without retries', async () => {
  const source = await sharp({
    create: { width: 16, height: 12, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  const output = await sharp({
    create: { width: 1024, height: 1536, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  let calls = 0;
  const transport: typeof fetch = async (input, init) => {
    calls++;
    const req = new Request(input as string, init);
    expect(req.url).toMatch(/^https:\/\/api.openai.com\/v1\//);
    if (req.url.endsWith('/images/edits')) {
      const form = await req.formData();
      const files = form.getAll('image[]') as File[];
      expect(files).toHaveLength(1);
      expect(Buffer.from(await files[0].arrayBuffer())).toEqual(source);
      expect(form.get('model')).toBe('gpt-image-1');
      return new Response(JSON.stringify({ data: [{ b64_json: output.toString('base64') }] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const body = await req.json();
    expect(body.input[0].content.filter((x: any) => x.type === 'input_image')).toHaveLength(2);
    expect(body.text.format.type).toBe('json_schema');
    return new Response(
      JSON.stringify({
        object: 'response',
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({ passed: [], errors: [], verdict: 'pass', repairPrompt: '' }),
                annotations: [],
              },
            ],
            role: 'assistant',
            status: 'completed',
          },
        ],
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  };
  const adapter = new OpenAIStudioAdapter(keys, 'seller-a', transport);
  const image = await adapter.generate(snapshot, [source], AbortSignal.timeout(10000));
  expect(image).toEqual(output);
  expect(
    (await adapter.audit(snapshot, [source], output, AbortSignal.timeout(10000))).verdict,
  ).toBe('pass');
  expect(calls).toBe(2);
});
test('401 payload is redacted, no automatic retry, invalid images and audit refusals rejected', async () => {
  let calls = 0;
  const unauthorized: typeof fetch = async () => {
    calls++;
    return new Response(
      JSON.stringify({ error: { code: 'invalid_api_key', message: 'fixture-key RAW SECRET' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  };
  const adapter = new OpenAIStudioAdapter(keys, 'seller-a', unauthorized);
  const result = await adapter.checkConnection();
  expect(result).toEqual({ ok: false, errorCode: 'invalid_api_key' });
  expect(JSON.stringify(result)).not.toContain('fixture-key');
  expect(calls).toBe(1);
  const bad = new OpenAIStudioAdapter(
    keys,
    'seller-a',
    async () =>
      new Response(JSON.stringify({ data: [{ b64_json: 'not-image' }] }), {
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  await expect(bad.generate(snapshot, [], AbortSignal.timeout(10000))).rejects.toThrow(
    'invalid_response',
  );
  const refused = new OpenAIStudioAdapter(
    keys,
    'seller-a',
    async () =>
      new Response(
        JSON.stringify({
          object: 'response',
          output: [
            { type: 'message', content: [{ type: 'refusal', refusal: 'no' }], role: 'assistant' },
          ],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  );
  await expect(
    refused.audit(
      snapshot,
      [],
      await sharp({ create: { width: 1, height: 1, channels: 3, background: 'white' } })
        .png()
        .toBuffer(),
      AbortSignal.timeout(10000),
    ),
  ).rejects.toThrow('refused');
});
test('redirect responses and timeout fail once without forwarding credential or retrying', async () => {
  let calls = 0;
  const transport: typeof fetch = async () => {
    calls++;
    return new Response('', {
      status: 302,
      headers: { Location: 'https://elsewhere.example/steal' },
    });
  };
  const a = new OpenAIStudioAdapter(keys, 'seller-a', transport);
  expect((await a.checkConnection()).ok).toBe(false);
  expect(calls).toBe(1);
  const timeout = new OpenAIStudioAdapter(keys, 'seller-a', async () => {
    throw new DOMException('secret', 'TimeoutError');
  });
  expect((await timeout.checkConnection()).errorCode).toBe('timeout');
});
