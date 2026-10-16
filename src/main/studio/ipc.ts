import { z } from 'zod';
import type { SellerId } from '../../shared/contracts';
import type { AssetStore } from './assets';
import type { StudioJobs } from './jobs';
import { requestSchema } from './jobs';
import type { CredentialStore } from './credentials';
import type { OpenAIStudioAdapter } from './openai-adapter';
import type { ProductProfileStore } from './profiles';
export interface StudioContext {
  assets: AssetStore;
  profiles: ProductProfileStore;
  jobs: StudioJobs;
  credentials: CredentialStore;
  adapter: (seller: SellerId) => OpenAIStudioAdapter;
  pickImages: () => Promise<string[]>;
  saveImage: (bytes: Buffer) => Promise<boolean>;
}
const id = z.string().min(1).max(200);
export async function dispatchStudio(
  ctx: StudioContext,
  seller: SellerId,
  trusted: boolean,
  method: string,
  args: unknown[],
) {
  if (!trusted || !Array.isArray(args)) throw new Error('Nguồn yêu cầu không hợp lệ');
  switch (method) {
    case 'importImages': {
      if (args.length) throw new Error('Không nhận đường dẫn từ renderer');
      const paths = await ctx.pickImages();
      return paths.length ? ctx.assets.importFiles(seller, paths) : [];
    }
    case 'preview':
      return ctx.assets.preview(seller, id.parse(args[0]));
    case 'assets':
      return ctx.assets.list(seller);
    case 'analyze': {
      const assetIds = z.array(id).min(1).max(6).parse(args[0]);
      const inputs = await Promise.all(assetIds.map((assetId) => ctx.assets.read(seller, assetId)));
      const analysis = await ctx.adapter(seller).analyze(inputs);
      return analysis;
    }
    case 'productProfile':
      return ctx.profiles.get(seller);
    case 'saveProductSize':
      return ctx.profiles.save(seller, z.string().max(200).parse(args[0]));
    case 'thumbnail':
      return ctx.assets.thumbnail(seller, id.parse(args[0]));
    case 'prepare':
      return ctx.jobs.prepare(seller, requestSchema.strict().parse(args[0]));
    case 'create': {
      ctx.credentials.resolve(seller);
      return ctx.jobs.create(seller, requestSchema.strict().parse(args[0]));
    }
    case 'run':
      return ctx.jobs.run(seller, id.parse(args[0]));
    case 'list':
      return ctx.jobs.list(seller);
    case 'get':
      return ctx.jobs.get(seller, id.parse(args[0]));
    case 'review':
      return ctx.jobs.review(
        seller,
        id.parse(args[0]),
        z.enum(['approve', 'reject']).parse(args[1]),
        z.boolean().parse(args[2]),
      );
    case 'retryAudit':
      ctx.credentials.resolve(seller);
      return ctx.jobs.retryAudit(seller, id.parse(args[0]));
    case 'cancelQueued':
      return ctx.jobs.cancelQueued(seller, id.parse(args[0]));
    case 'exportApproved': {
      const job = ctx.jobs.get(seller, id.parse(args[0]));
      if (job.state !== 'approved') throw new Error('Chỉ xuất ảnh đã duyệt');
      return ctx.saveImage(await ctx.assets.read(seller, job.outputAssetIds.at(-1)!));
    }
    case 'credentialStatus':
      return ctx.credentials.status(seller);
    case 'credentialSave':
      return ctx.credentials.save(seller, z.string().min(1).max(1024).parse(args[0]));
    case 'credentialRemove':
      return ctx.credentials.remove(seller);
    case 'checkConnection':
      return ctx.adapter(seller).checkConnection();
    default:
      throw new Error('Thao tác không được hỗ trợ');
  }
}
import { studioMessages as codes } from '../../shared/studio-messages';
export function studioErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (codes[message]) return codes[message];
  if (message === 'Không có kho mã hóa an toàn của hệ điều hành') return message;
  if (message.startsWith('Thiếu hoặc không hỗ trợ biến:'))
    return 'Prompt thiếu giá trị biến hoặc có biến không hỗ trợ.';
  return 'Không thể thực hiện thao tác. Kiểm tra ảnh, dữ liệu đầu vào, trạng thái tác vụ và quyền ghi thư mục ứng dụng.';
}
