import type { Database } from 'better-sqlite3';
import { z } from 'zod';
const schema = z.object({
  prompts: z.array(
    z.object({
      id: z.string().min(1),
      version: z.number().int().positive(),
      name_vi: z.string(),
      name_ru: z.string(),
      description_vi: z.string(),
      category: z.enum(['system', 'image', 'quality']),
      body: z.string().min(1),
    }),
  ),
});
export function seed(db: Database, bundle: unknown) {
  const parsed = schema.parse(bundle);
  db.transaction(() => {
    const put = db.prepare(
      `INSERT INTO system_prompts(id,version,body,data,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,body=excluded.body,data=excluded.data,updated_at=excluded.updated_at WHERE excluded.version>system_prompts.version`,
    );
    for (const p of parsed.prompts)
      put.run(
        p.id,
        p.version,
        p.body,
        JSON.stringify({
          name: p.name_vi,
          nameRu: p.name_ru,
          description: p.description_vi,
          category: p.category,
          body: p.body,
          tags: [],
          group: '',
          mode: p.id,
        }),
        new Date().toISOString(),
      );
  })();
}
