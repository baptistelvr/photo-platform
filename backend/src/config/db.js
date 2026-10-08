const path = require('node:path');
const env = require('./env');
const { ConfigError } = require('../utils/httpError');

const isPostgres = /^postgres(?:ql)?:\/\//i.test(env.DATABASE_URL);
let sqlite;
let pool;

if (isPostgres) {
  const { Pool } = require('@neondatabase/serverless');
  pool = new Pool({ connectionString: env.DATABASE_URL });
} else if (env.DATABASE_URL && !env.IS_VERCEL) {
  const fs = require('node:fs');
  const Database = require('better-sqlite3');
  const dbPath = path.resolve(env.DATABASE_URL);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
}

function runSqlite(text, params) {
  if (!sqlite) throw new ConfigError('Aucune base de données configurée (DATABASE_URL ou POSTGRES_URL).');
  const statement = sqlite.prepare(text.replace(/\$(\d+)/g, '?'));
  if (statement.reader) {
    const rows = statement.all(...params);
    return { rows, rowCount: rows.length };
  }
  const result = statement.run(...params);
  return { rows: [], rowCount: result.changes };
}

async function query(text, params = []) {
  if (pool) {
    const result = await pool.query(text, params);
    return { rows: result.rows, rowCount: result.rowCount };
  }
  return runSqlite(text, params);
}

/**
 * Runs `fn` inside a transaction. `fn` receives a query function bound to the
 * transaction. On Postgres an optional advisory lock serialises concurrent
 * callers (e.g. several cold starts migrating at once).
 */
async function transaction(fn, { lockKey } = {}) {
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (lockKey) await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
      const result = await fn(async (text, params = []) => {
        const res = await client.query(text, params);
        return { rows: res.rows, rowCount: res.rowCount };
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  if (!sqlite) throw new ConfigError('Aucune base de données configurée (DATABASE_URL ou POSTGRES_URL).');
  sqlite.exec('BEGIN');
  try {
    const result = await fn(async (text, params = []) => runSqlite(text, params));
    sqlite.exec('COMMIT');
    return result;
  } catch (error) {
    if (sqlite.inTransaction) sqlite.exec('ROLLBACK');
    throw error;
  }
}

function assertConfigured() {
  if (!isPostgres && !sqlite) {
    throw new ConfigError('Base de données manquante : reliez une base Neon Postgres au projet Vercel.');
  }
  if (env.IS_VERCEL && !isPostgres) {
    throw new ConfigError('Sur Vercel, DATABASE_URL (ou POSTGRES_URL) doit pointer vers une base Postgres.');
  }
}

async function close() {
  if (pool) await pool.end();
  if (sqlite) sqlite.close();
}

module.exports = {
  query,
  transaction,
  close,
  assertConfigured,
  dialect: isPostgres ? 'postgres' : 'sqlite',
  pool,
};
