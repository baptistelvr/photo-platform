const { db } = require('../config/db');

const baseSelect = `
  SELECT u.id, u.name, u.email, u.role, u.status, u.last_login as lastLogin, u.created_at as createdAt, u.updated_at as updatedAt
  FROM users u
`;

function mapUser(row) {
  if (!row) return null;
  return row;
}

function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
}

function findById(id) {
  return mapUser(db.prepare(`${baseSelect} WHERE u.id = ?`).get(id));
}

function findAuthById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function listUsers() {
  return db.prepare(`${baseSelect} ORDER BY u.created_at DESC`).all();
}

function createUser({ name, email, passwordHash, role = 'user', status = 'active' }) {
  const result = db
    .prepare(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES (@name, @email, @passwordHash, @role, @status)`
    )
    .run({ name, email: email.toLowerCase(), passwordHash, role, status });

  return findById(result.lastInsertRowid);
}

function updateUser(id, fields) {
  const allowed = ['name', 'email', 'role', 'status'];
  const entries = Object.entries(fields).filter(([key, value]) => allowed.includes(key) && value !== undefined);
  if (!entries.length) return findById(id);

  const setClause = entries.map(([key]) => `${key === 'email' ? 'email' : key} = @${key}`).join(', ');
  const payload = Object.fromEntries(entries);
  if (payload.email) payload.email = payload.email.toLowerCase();

  db.prepare(`UPDATE users SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({ ...payload, id });
  return findById(id);
}

function updatePassword(id, passwordHash) {
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(passwordHash, id);
}

function deleteUser(id) {
  return db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

function setLastLogin(id) {
  db.prepare("UPDATE users SET last_login = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(id);
}

function getPermissions(userId) {
  return db
    .prepare(
      `SELECT p.code
       FROM permissions p
       JOIN user_permissions up ON up.permission_id = p.id
       WHERE up.user_id = ?`
    )
    .all(userId)
    .map((row) => row.code);
}

function setPermissions(userId, permissionCodes) {
  db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(userId);
  if (!permissionCodes.length) return;

  const permissionRows = db
    .prepare(`SELECT id, code FROM permissions WHERE code IN (${permissionCodes.map(() => '?').join(',')})`)
    .all(...permissionCodes);

  const stmt = db.prepare('INSERT INTO user_permissions (user_id, permission_id) VALUES (?, ?)');
  for (const row of permissionRows) {
    stmt.run(userId, row.id);
  }
}

function listPermissions() {
  return db.prepare('SELECT id, code, description FROM permissions ORDER BY code').all();
}

module.exports = {
  findByEmail,
  findById,
  findAuthById,
  listUsers,
  createUser,
  updateUser,
  updatePassword,
  deleteUser,
  setLastLogin,
  getPermissions,
  setPermissions,
  listPermissions,
};
