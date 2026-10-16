import type { Database } from 'better-sqlite3';
export function migrate(db: Database) {
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version > 2) throw new Error('Database được tạo bởi phiên bản mới hơn');
  if (version === 2) return;
  db.transaction(() => {
    if(version<1) db.exec(`
 CREATE TABLE system_prompts(id TEXT PRIMARY KEY,version INTEGER NOT NULL,body TEXT NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE seller_prompts(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL,system_prompt_id TEXT REFERENCES system_prompts(id),version INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(seller_id,system_prompt_id));
 CREATE TABLE prompt_versions(prompt_id TEXT NOT NULL REFERENCES seller_prompts(id) ON DELETE CASCADE,seller_id TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(seller_id,prompt_id,version));
 CREATE TABLE seller_prompt_preferences(seller_id TEXT NOT NULL,prompt_id TEXT NOT NULL,is_favorite INTEGER NOT NULL DEFAULT 0,last_used_at TEXT,PRIMARY KEY(seller_id,prompt_id));
 CREATE TABLE seller_prompt_defaults(seller_id TEXT NOT NULL,mode TEXT NOT NULL,prompt_id TEXT NOT NULL,PRIMARY KEY(seller_id,mode));
 PRAGMA user_version=1;
 `);
    db.exec(`
 CREATE TABLE assets(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL,mime TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,sha256 TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE image_jobs(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL,data TEXT NOT NULL);
 CREATE TABLE app_credentials(seller_id TEXT PRIMARY KEY,encrypted BLOB NOT NULL);
 PRAGMA user_version=2;
 `);
  })();
}
