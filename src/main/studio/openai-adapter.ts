import OpenAI, { toFile } from 'openai';
import { EnvHttpProxyAgent } from 'undici';
import sharp from 'sharp';
import type { SellerId } from '../../shared/contracts';
import type { PromptSnapshot, QualityReport } from '../../shared/studio-contracts';
import type { CredentialStore } from './credentials';
import { qualitySchema } from './jobs';
import { interpolate } from '../../shared/interpolation';
let proxy: EnvHttpProxyAgent | undefined;
const reportJsonSchema = {
  type: 'object',
  properties: {
    passed: {
      type: 'array',
      items: {
        type: 'object',
        properties: { description: { type: 'string' }, confidence: { type: 'number' } },
        required: ['description', 'confidence'],
        additionalProperties: false,
      },
    },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: { description: { type: 'string' }, confidence: { type: 'number' } },
        required: ['description', 'confidence'],
        additionalProperties: false,
      },
    },
    verdict: { type: 'string', enum: ['pass', 'manual_review', 'fail'] },
    repairPrompt: { type: 'string' },
  },
  required: ['passed', 'errors', 'verdict', 'repairPrompt'],
  additionalProperties: false,
};
function errorCode(error: unknown) {
  const e = error as { status?: number; code?: string; name?: string; cause?: { name?: string } };
  if (e.status === 401) return 'invalid_api_key';
  if (e.status === 403) return 'access_denied';
  if (e.code === 'insufficient_quota') return 'quota';
  if (e.status === 429) return 'rate_limited';
  if (e.status === 404) return 'model_unavailable';
  if ((e.status ?? 0) >= 500) return 'network';
  if (/timeout|abort/i.test((e.name ?? '') + ' ' + (e.cause?.name ?? ''))) return 'timeout';
  if (
    error instanceof Error &&
    [
      'invalid_response',
      'refused',
      'credential_missing',
      'credential_unavailable',
      'timeout',
      'invalid_prompt',
    ].includes(error.message)
  )
    return error.message;
  return error instanceof OpenAI.APIConnectionError ? 'network' : 'invalid_response';
}
export class OpenAIStudioAdapter {
  constructor(
    private credentials: Pick<CredentialStore, 'resolve'>,
    private seller: SellerId,
    private transport?: typeof fetch,
  ) {}
  private client() {
    const key = this.credentials.resolve(this.seller);
    const custom: typeof fetch = async (input, init) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== 'https://api.openai.com' || !url.pathname.startsWith('/v1/'))
        throw new Error('network');
      const options: RequestInit & { dispatcher?: EnvHttpProxyAgent } = {
        ...init,
        redirect: 'error',
      };
      if (!this.transport && (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)) {
        proxy ??= new EnvHttpProxyAgent();
        options.dispatcher = proxy;
      }
      const response = await (this.transport ?? fetch)(input, options);
      if (response.status >= 300 && response.status < 400) throw new Error('network');
      return response;
    };
    return new OpenAI({
      apiKey: key,
      baseURL: 'https://api.openai.com/v1',
      maxRetries: 0,
      timeout: 180000,
      fetch: custom,
    });
  }
  async checkConnection() {
    try {
      await this.client().models.list();
      return { ok: true, errorCode: null };
    } catch (e) {
      return { ok: false, errorCode: errorCode(e) };
    }
  }
  async generate(snapshot: PromptSnapshot, inputs: Buffer[], signal: AbortSignal): Promise<Buffer> {
    try {
      if (snapshot.finalPrompt.length > 32000) throw new Error('invalid_prompt');
      const files = await Promise.all(
        inputs.map(async (bytes, i) => {
          const format = (await sharp(bytes).metadata()).format;
          const mime =
            format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
          return toFile(bytes, `reference-${i}.${format ?? 'png'}`, { type: mime });
        }),
      );
      const response = await this.client().images.edit(
        {
          model: 'gpt-image-1',
          image: files,
          prompt: snapshot.finalPrompt,
          n: 1,
          size: '1024x1536',
          output_format: 'png',
        },
        { signal },
      );
      const encoded = response.data?.[0]?.b64_json;
      if (
        !encoded ||
        encoded.length > 28 * 1024 * 1024 ||
        Buffer.from(encoded, 'base64').toString('base64') !== encoded
      )
        throw new Error('invalid_response');
      const bytes = Buffer.from(encoded, 'base64');
      const info = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
      if (info.width !== 1024 || info.height !== 1536) throw new Error('invalid_response');
      await sharp(bytes).stats();
      return bytes;
    } catch (e) {
      const code = errorCode(e);
      throw new Error(code);
    }
  }
  async audit(
    snapshot: PromptSnapshot,
    inputs: Buffer[],
    output: Buffer,
    signal: AbortSignal,
  ): Promise<QualityReport> {
    try {
      const images = await Promise.all(
        [...inputs, output].map(async (bytes) => {
          const format = (await sharp(bytes).metadata()).format;
          return {
            type: 'input_image' as const,
            detail: 'high' as const,
            image_url: `data:image/${format === 'jpeg' ? 'jpeg' : format === 'webp' ? 'webp' : 'png'};base64,${bytes.toString('base64')}`,
          };
        }),
      );
      const response = await this.client().responses.create(
        {
          model: 'gpt-4.1-mini',
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text:
                    'Mandatory: Compare ALL reference images with the LAST generated image. Do not assume generated details are factual. Return manual_review when reference evidence is insufficient. No automatic approval.\n' +
                    snapshot.audit.body,
                },
                ...images,
              ],
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'product_image_quality',
              strict: true,
              schema: reportJsonSchema,
            },
          },
        },
        { signal },
      );
      if (
        response.output.some(
          (item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal'),
        )
      )
        throw new Error('refused');
      if (response.status === 'incomplete') throw new Error('invalid_response');
      return qualitySchema.parse(JSON.parse(response.output_text));
    } catch (e) {
      const code = errorCode(e);
      throw new Error(code);
    }
  }
}
