const path = require('node:path');
const env = require('./env');

const isPostgres = /^postgres(?:ql)?:\/\//i.test(env.DATABASE_URL);
let sqlite;
let pool;

if (isPostgres) {
  const { Pool } = require('@neondatabase/serverless');
  pool = new Pool({ connectionString: env.DATABASE_URL });
} else if (!process.env.VERCEL) {
  const fs = require('node:fs');
  const Database = require('better-sqlite3');
  const dbPath = path.resolve(env.DATABASE_URL);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  sqlite = new Database(dbPath);
  sqlite.pragma('foreign_keys = ON');
}

async function query(text, params = []) {
  if (pool) {
    const result = await pool.query(text, params);
    return { rows: result.rows, rowCount: result.rowCount };
  }

  if (!sqlite) throw new Error('DATABASE_URL must point to the connected Neon Postgres database on Vercel.');

  const sqliteSql = text.replace(/\$(\d+)/g, '?');
  const statement = sqlite.prepare(sqliteSql);
  if (/\bRETURNING\b/i.test(sqliteSql) || /^\s*(SELECT|WITH|PRAGMA)\b/i.test(sqliteSql)) {
    const rows = statement.all(...params);
    return { rows, rowCount: rows.length };
  }
  const result = statement.run(...params);
  return { rows: [], rowCount: result.changes };
}

function assertProductionConfiguration() {
  if (!process.env.VERCEL) return;
  if (!isPostgres) throw new Error('DATABASE_URL must point to the connected Neon Postgres database on Vercel.');
  if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Connect a private Vercel Blob store before starting the API.');
  }
}

async function close() {
  if (pool) await pool.end();
  if (sqlite) sqlite.close();
}

module.exports = { query, close, assertProductionConfiguration, dialect: isPostgres ? 'postgres' : 'sqlite', pool };
