const { query } = require('../config/db');
const { writeOrder } = require('./orderRepository');

const columns = `id, name, description, featured, visibility, password_hash AS "passwordHash", sort_order AS "sortOrder",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

async function listCollections() {
  const { rows } = await query(`SELECT ${columns} FROM collections ORDER BY sort_order, id`);
  return rows;
}

async function getCollectionById(id) {
  const { rows } = await query(`SELECT ${columns} FROM collections WHERE id = $1`, [id]);
  return rows[0] || null;
}

/** New collections go last. */
async function createCollection({ name, description, featured = false, visibility = 'public', passwordHash = null }) {
  const { rows } = await query(`INSERT INTO collections (name, description, featured, visibility, password_hash, sort_order)
    VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM collections)) RETURNING id`,
  [name, description || null, featured ? 1 : 0, visibility, passwordHash]);
  return getCollectionById(rows[0].id);
}

async function updateCollection(id, { name, description, featured, visibility, passwordHash }) {
  await query(`UPDATE collections SET name = $1, description = $2, featured = $3, visibility = $4, password_hash = $5,
    updated_at = CAST(CURRENT_TIMESTAMP AS TEXT) WHERE id = $6`,
  [name, description || null, featured ? 1 : 0, visibility, passwordHash || null, id]);
  return getCollectionById(id);
}

async function deleteCollection(id) {
  return query('DELETE FROM collections WHERE id = $1', [id]);
}

async function reorderCollections(ids, run) {
  await writeOrder('collections', ids, run);
}

module.exports = {
  listCollections, getCollectionById, createCollection, updateCollection, deleteCollection, reorderCollections,
};
