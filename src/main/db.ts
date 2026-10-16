import Database from 'better-sqlite3';
import {migrate} from './migrations';
export function openDatabase(path:string):Database.Database{const db=new Database(path);db.pragma('foreign_keys = ON');db.pragma('journal_mode = WAL');migrate(db);return db}
