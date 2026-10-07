const db = require('../config/db');
const { ALL_PERMISSIONS, PERMISSION_DESCRIPTIONS } = require('../constants/permissions');

const MIGRATION_LOCK_KEY = 735194200;

function schemaStatements(dialect) {
  const id = dialect === 'postgres' ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const now = '(CAST(CURRENT_TIMESTAMP AS TEXT))';
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id ${id}, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active', last_login TEXT,
      created_at TEXT NOT NULL DEFAULT ${now}, updated_at TEXT NOT NULL DEFAULT ${now}
    )`,
    `CREATE TABLE IF NOT EXISTS permissions (
      id ${id}, code TEXT UNIQUE NOT NULL, description TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS user_permissions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, permission_id)
    )`,
    `CREATE TABLE IF NOT EXISTS albums (
      id ${id}, name TEXT NOT NULL, description TEXT, cover_photo_id INTEGER,
      visibility TEXT NOT NULL DEFAULT 'public', password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT ${now}, updated_at TEXT NOT NULL DEFAULT ${now}
    )`,
    `CREATE TABLE IF NOT EXISTS album_access (
      album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (album_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS photos (
      id ${id}, album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      filename TEXT NOT NULL, original_name TEXT NOT NULL, original_path TEXT NOT NULL,
      thumbnail_path TEXT NOT NULL, size INTEGER NOT NULL, mime_type TEXT NOT NULL,
      width INTEGER NOT NULL, height INTEGER NOT NULL,
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${now}
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id ${id}, actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL,
      object_type TEXT NOT NULL, object_id TEXT, metadata TEXT, ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT ${now}
    )`,
    'CREATE INDEX IF NOT EXISTS idx_photos_album ON photos (album_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_album_access_user ON album_access (user_id)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at)',
  ];

  if (dialect === 'postgres') {
    // Session table for connect-pg-simple. Created here so the store never has
    // to read its bundled table.sql at runtime.
    statements.push(
      `CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR NOT NULL PRIMARY KEY, sess JSON NOT NULL, expire TIMESTAMP(6) NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions (expire)',
      'DELETE FROM sessions WHERE expire < NOW()',
    );
  }

  return statements;
}

async function migrate() {
  await db.transaction(async (query) => {
    for (const statement of schemaStatements(db.dialect)) {
      await query(statement);
    }
    for (const code of ALL_PERMISSIONS) {
      await query(
        'INSERT INTO permissions (code, description) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET description = excluded.description',
        [code, PERMISSION_DESCRIPTIONS[code] || code],
      );
    }
  }, { lockKey: MIGRATION_LOCK_KEY });
}

module.exports = { migrate };
