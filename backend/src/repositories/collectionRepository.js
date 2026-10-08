const { query } = require('../config/db');

const columns = `id, name, description, created_at AS "createdAt", updated_at AS "updatedAt"`;

async function listCollections() {
  const { rows } = await query(`SELECT ${columns} FROM collections ORDER BY name`);
  return rows;
}

async function getCollectionById(id) {
  const { rows } = await query(`SELECT ${columns} FROM collections WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function createCollection({ name, description }) {
  const { rows } = await query('INSERT INTO collections (name, description) VALUES ($1, $2) RETURNING id',
    [name, description || null]);
  return getCollectionById(rows[0].id);
}

async function updateCollection(id, { name, description }) {
  await query(`UPDATE collections SET name = $1, description = $2, updated_at = CAST(CURRENT_TIMESTAMP AS TEXT)
    WHERE id = $3`, [name, description || null, id]);
  return getCollectionById(id);
}

async function deleteCollection(id) {
  return query('DELETE FROM collections WHERE id = $1', [id]);
}

module.exports = { listCollections, getCollectionById, createCollection, updateCollection, deleteCollection };
