const { query, dialect } = require('../config/db');
const { ALL_PERMISSIONS } = require('../constants/permissions');

async function migrate() {
  const id = dialect === 'postgres' ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  await query(`CREATE TABLE IF NOT EXISTS users (
    id ${id}, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active', last_login TEXT,
    created_at TEXT NOT NULL DEFAULT (CAST(CURRENT_TIMESTAMP AS TEXT)), updated_at TEXT NOT NULL DEFAULT (CAST(CURRENT_TIMESTAMP AS TEXT))
  )`);
  await query(`CREATE TABLE IF NOT EXISTS permissions (
    id ${id}, code TEXT UNIQUE NOT NULL, description TEXT
  )`);
  await query(`CREATE TABLE IF NOT EXISTS user_permissions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, permission_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS albums (
    id ${id}, name TEXT NOT NULL, description TEXT, cover_photo_id INTEGER,
    visibility TEXT NOT NULL DEFAULT 'public', password_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (CAST(CURRENT_TIMESTAMP AS TEXT)), updated_at TEXT NOT NULL DEFAULT (CAST(CURRENT_TIMESTAMP AS TEXT))
  )`);
  await query(`CREATE TABLE IF NOT EXISTS album_access (
    album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (album_id, user_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS photos (
    id ${id}, album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    filename TEXT NOT NULL, original_name TEXT NOT NULL, original_path TEXT NOT NULL,
    thumbnail_path TEXT NOT NULL, size INTEGER NOT NULL, mime_type TEXT NOT NULL,
    width INTEGER NOT NULL, height INTEGER NOT NULL,
    uploaded_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (CAST(CURRENT_TIMESTAMP AS TEXT))
  )`);
  await query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id ${id}, actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL,
    object_type TEXT NOT NULL, object_id TEXT, metadata TEXT, ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (CAST(CURRENT_TIMESTAMP AS TEXT))
  )`);

  for (const code of ALL_PERMISSIONS) {
    await query('INSERT INTO permissions (code, description) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING', [code, code]);
  }
}

module.exports = { migrate };
