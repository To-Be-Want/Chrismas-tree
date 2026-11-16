import { DatabaseSync } from 'node:sqlite';
import { resolve, dirname } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
const source = resolve(process.env.DATABASE_PATH || 'data/wishes.sqlite');
if (!existsSync(source)) { console.error('数据库不存在，未创建空备份。'); process.exit(1); }
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = resolve(process.argv[2] || `data/backups/wishes-${stamp}.sqlite`);
if (target === source || existsSync(target)) { console.error('备份目标必须是一个不存在的新文件。'); process.exit(1); }
mkdirSync(dirname(target), { recursive: true });
const db = new DatabaseSync(source);
try {
  // VACUUM INTO creates a consistent SQLite snapshot, including committed WAL data.
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  console.log(`备份已保存：${target}`);
} finally { db.close(); }
