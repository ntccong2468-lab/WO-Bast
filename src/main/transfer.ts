import type { Database } from 'better-sqlite3';
import { z } from 'zod';
import { PromptService, inputSchema } from './prompt-service';
import type { SellerId } from '../shared/contracts';
export function exportPrompts(service: PromptService, seller: SellerId, ids: string[]): string {
  if (ids.length > 100) throw new Error('Tối đa 100 prompt');
  return JSON.stringify(
    { schema_version: 1, prompts: ids.map((id) => inputSchema.parse(service.get(seller, id))) },
    null,
    2,
  );
}
export function importPrompts(
  db: Database,
  service: PromptService,
  seller: SellerId,
  json: string,
) {
  if (Buffer.byteLength(json, 'utf8') > 2 * 1024 * 1024) throw new Error('JSON tối đa 2 MiB');
  const bundle = z
    .object({ schema_version: z.literal(1), prompts: z.array(z.unknown()).min(1).max(100) })
    .parse(JSON.parse(json));
  const inputs = bundle.prompts.map((raw) => {
    if (typeof raw !== 'object' || raw === null) throw new Error('Prompt không hợp lệ');
    const p = raw as Record<string, unknown>;
    return inputSchema.parse(
      'name_vi' in p
        ? {
            name: p.name_vi,
            nameRu: p.name_ru,
            description: p.description_vi,
            category: p.category,
            body: p.body,
            tags: [],
            group: '',
            mode: p.id,
          }
        : p,
    );
  });
  return db.transaction(() => inputs.map((p) => service.create(seller, p)))();
}
