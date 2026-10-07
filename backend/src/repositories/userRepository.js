const db = require('../config/db');

const { query } = db;
const baseSelect = `SELECT u.id, u.name, u.email, u.role, u.status, u.last_login AS "lastLogin",
  u.created_at AS "createdAt", u.updated_at AS "updatedAt" FROM users u`;

async function findByEmail(email) {
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await query(`${baseSelect} WHERE u.id = $1`, [id]);
  return rows[0] || null;
}

async function findAuthById(id) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function listUsers() {
  const { rows } = await query(`${baseSelect} ORDER BY u.created_at DESC, u.id DESC`);
  return rows;
}

async function countUsers() {
  const { rows } = await query('SELECT CAST(COUNT(*) AS INTEGER) AS count FROM users');
  return rows[0].count;
}

async function createUser({ name, email, passwordHash, role = 'user', status = 'active' }) {
  const { rows } = await query('INSERT INTO users (name, email, password_hash, role, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [name.trim(), email.trim().toLowerCase(), passwordHash, role, status]);
  return findById(rows[0].id);
}

async function createInitialAdmin({ name, email, passwordHash }) {
  return db.transaction(async (tx) => {
    const { rows } = await tx('SELECT CAST(COUNT(*) AS INTEGER) AS count FROM users');
    if (rows[0].count > 0) return false;
    await tx('INSERT INTO users (name, email, password_hash, role, status) VALUES ($1, $2, $3, $4, $5)',
      [name.trim(), email.trim().toLowerCase(), passwordHash, 'main_admin', 'active']);
    return true;
  }, { lockKey: 735194201 });
}

async function updateUser(id, fields) {
  const columns = { name: 'name', email: 'email', role: 'role', status: 'status' };
  const entries = Object.entries(fields)
    .filter(([key, value]) => columns[key] && value !== undefined)
    .map(([key, value]) => [key, key === 'email' ? value.trim().toLowerCase() : value]);
  if (!entries.length) return findById(id);
  const params = entries.map(([, value]) => value);
  const setClause = entries.map(([key], index) => `${columns[key]} = $${index + 1}`).join(', ');
  params.push(id);
  await query(`UPDATE users SET ${setClause}, updated_at = CAST(CURRENT_TIMESTAMP AS TEXT) WHERE id = $${params.length}`, params);
  return findById(id);
}

async function updatePassword(id, passwordHash) {
  await query('UPDATE users SET password_hash = $1, updated_at = CAST(CURRENT_TIMESTAMP AS TEXT) WHERE id = $2', [passwordHash, id]);
}

async function deleteUser(id) {
  return query('DELETE FROM users WHERE id = $1', [id]);
}

async function setLastLogin(id) {
  await query('UPDATE users SET last_login = CAST(CURRENT_TIMESTAMP AS TEXT) WHERE id = $1', [id]);
}

async function getPermissions(userId) {
  const { rows } = await query(`SELECT p.code FROM permissions p JOIN user_permissions up ON up.permission_id = p.id
    WHERE up.user_id = $1 ORDER BY p.code`, [userId]);
  return rows.map((row) => row.code);
}

async function listPermissionsByUser() {
  const { rows } = await query(`SELECT up.user_id AS "userId", p.code FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id ORDER BY p.code`);
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.userId)) map.set(row.userId, []);
    map.get(row.userId).push(row.code);
  }
  return map;
}

async function setPermissions(userId, permissionCodes) {
  await query('DELETE FROM user_permissions WHERE user_id = $1', [userId]);
  if (!permissionCodes.length) return;
  const { rows } = await query(
    `SELECT id FROM permissions WHERE code IN (${permissionCodes.map((_, i) => `$${i + 1}`).join(', ')})`,
    permissionCodes,
  );
  for (const row of rows) {
    await query('INSERT INTO user_permissions (user_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, row.id]);
  }
}

async function listPermissions() {
  const { rows } = await query('SELECT id, code, description FROM permissions ORDER BY id');
  return rows;
}

module.exports = {
  findByEmail,
  findById,
  findAuthById,
  listUsers,
  countUsers,
  createUser,
  updateUser,
  createInitialAdmin,
  updatePassword,
  deleteUser,
  setLastLogin,
  getPermissions,
  listPermissionsByUser,
  setPermissions,
  listPermissions,
};
