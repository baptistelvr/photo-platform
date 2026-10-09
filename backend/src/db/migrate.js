const db = require('../config/db');
const { writeOrder } = require('../repositories/orderRepository');
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
    `CREATE TABLE IF NOT EXISTS collections (
      id ${id}, name TEXT NOT NULL, description TEXT,
      created_at TEXT NOT NULL DEFAULT ${now}, updated_at TEXT NOT NULL DEFAULT ${now}
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

async function hasColumn(query, table, name) {
  if (db.dialect === 'postgres') {
    const { rows } = await query(
      'SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
      [table, name],
    );
    return rows.length > 0;
  }
  const { rows } = await query(`PRAGMA table_info(${table})`);
  return rows.some((row) => row.name === name);
}

/** Columns added after the first release. SQLite has no ADD COLUMN IF NOT EXISTS. */
async function addMissingColumns(query) {
  const columns = [
    ['albums', 'collection_id', 'INTEGER REFERENCES collections(id) ON DELETE SET NULL'],
    // Manual order chosen by editors. The first photo is the album cover, the
    // first album gives the collection its cover.
    ['collections', 'sort_order', 'INTEGER'],
    ['collections', 'featured', 'INTEGER NOT NULL DEFAULT 0'],
    ['albums', 'sort_order', 'INTEGER'],
    ['photos', 'sort_order', 'INTEGER'],
  ];
  for (const [table, name, definition] of columns) {
    if (!(await hasColumn(query, table, name))) await query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
  await query('CREATE INDEX IF NOT EXISTS idx_albums_collection ON albums (collection_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_photos_album_order ON photos (album_id, sort_order)');
}

const byName = (a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' }) || a.id - b.id;

/**
 * Gives an order to rows created before ordering existed, matching what was
 * displayed until then: photos newest first, except a hand-picked cover which
 * comes first; albums and collections by name. Only rows without an order are
 * touched, so this runs once.
 */
async function backfillOrder(query) {
  await query(`UPDATE photos SET sort_order = 0 WHERE sort_order IS NULL
    AND id IN (SELECT cover_photo_id FROM albums WHERE cover_photo_id IS NOT NULL)`);
  await query(`UPDATE photos SET sort_order = 1 + (SELECT COUNT(*) FROM photos p2 WHERE p2.album_id = photos.album_id
      AND (p2.created_at > photos.created_at OR (p2.created_at = photos.created_at AND p2.id > photos.id)))
    WHERE sort_order IS NULL`);
  await query('UPDATE albums SET cover_photo_id = NULL WHERE cover_photo_id IS NOT NULL');

  const { rows: albums } = await query('SELECT id, name, collection_id AS "collectionId", sort_order AS "sortOrder" FROM albums');
  const groups = new Map();
  for (const album of albums) {
    const key = album.collectionId ?? 0;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(album);
  }
  for (const group of groups.values()) {
    if (group.some((album) => album.sortOrder === null)) await writeOrder('albums', [...group].sort(byName).map((a) => a.id), query);
  }

  const { rows: collections } = await query('SELECT id, name, sort_order AS "sortOrder" FROM collections');
  if (collections.some((collection) => collection.sortOrder === null)) {
    await writeOrder('collections', [...collections].sort(byName).map((c) => c.id), query);
  }
}

async function migrate() {
  await db.transaction(async (query) => {
    for (const statement of schemaStatements(db.dialect)) {
      await query(statement);
    }
    await addMissingColumns(query);
    await backfillOrder(query);
    for (const code of ALL_PERMISSIONS) {
      await query(
        'INSERT INTO permissions (code, description) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET description = excluded.description',
        [code, PERMISSION_DESCRIPTIONS[code] || code],
      );
    }
  }, { lockKey: MIGRATION_LOCK_KEY });
}

module.exports = { migrate };
