import { z } from 'zod';
import type { Database } from 'better-sqlite3';
import { PromptService, inputSchema } from './prompt-service';
import { Session } from './session';
import { importPrompts, exportPrompts } from './transfer';
const id = z.string().min(1).max(200);
export function dispatch(
  ctx: { db: Database; service: PromptService; session: Session },
  trusted: boolean,
  method: string,
  args: unknown[],
) {
  if (!trusted) throw new Error('Nguồn yêu cầu không hợp lệ');
  if (!Array.isArray(args)) throw new Error('Payload không hợp lệ');
  const { db, service: s, session } = ctx,
    seller = session.seller;
  switch (method) {
    case 'session':
      return { seller };
    case 'switchSeller':
      session.switch(z.enum(['seller-a', 'seller-b']).parse(args[0]));
      return;
    case 'setDirty':
      session.dirty = z.boolean().parse(args[0]);
      return;
    case 'list':
      return s.list(seller);
    case 'get':
      return s.get(seller, id.parse(args[0]));
    case 'create':
      return s.create(seller, inputSchema.parse(args[0]));
    case 'save':
      return s.save(seller, id.parse(args[0]), inputSchema.parse(args[1]));
    case 'clone':
      return s.clone(seller, id.parse(args[0]));
    case 'remove':
      return s.remove(seller, id.parse(args[0]));
    case 'versions':
      return s.versions(seller, id.parse(args[0]));
    case 'restore':
      return s.restore(seller, id.parse(args[0]), z.number().int().positive().parse(args[1]));
    case 'reset':
      return s.reset(seller, id.parse(args[0]));
    case 'favorite':
      return s.favorite(seller, id.parse(args[0]), z.boolean().parse(args[1]));
    case 'setDefault':
      return s.setDefault(seller, id.parse(args[0]), id.parse(args[1]));
    case 'defaults':
      return s.defaults(seller);
    case 'markUsed':
      return s.markUsed(seller, id.parse(args[0]));
    case 'importJson':
      return importPrompts(
        db,
        s,
        seller,
        z
          .string()
          .max(2 * 1024 * 1024)
          .parse(args[0]),
      );
    case 'exportJson':
      return exportPrompts(s, seller, z.array(id).max(100).parse(args[0]));
    default:
      throw new Error('Thao tác không được hỗ trợ');
  }
}
