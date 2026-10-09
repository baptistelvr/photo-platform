const { query } = require('../config/db');
const { writeOrder } = require('./orderRepository');

// New and moved photos go at the end of their album. Two uploads landing at
// the same time may share a place; the id then keeps them in upload order.
const nextInAlbum = (param) => `(SELECT COALESCE(MAX(sort_order), -1) + 1 FROM photos WHERE album_id = $${param})`;

async function createPhoto(payload) {
  const { rows } = await query(`INSERT INTO photos (album_id, filename, original_name, original_path, thumbnail_path,
    size, mime_type, width, height, uploaded_by, sort_order)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ${nextInAlbum(11)}) RETURNING id`,
  [payload.albumId, payload.filename, payload.originalName, payload.originalPath, payload.thumbnailPath,
    payload.size, payload.mimeType, payload.width, payload.height, payload.uploadedBy, payload.albumId]);
  return getPhotoById(rows[0].id);
}

async function getPhotoById(id) {
  const { rows } = await query(`SELECT p.id, p.album_id AS "albumId", p.filename, p.original_name AS "originalName",
    p.original_path AS "originalPath", p.thumbnail_path AS "thumbnailPath", p.size, p.mime_type AS "mimeType",
    p.width, p.height, p.uploaded_by AS "uploadedBy", p.created_at AS "createdAt"
    FROM photos p WHERE p.id = $1`, [id]);
  return rows[0] || null;
}

async function deletePhoto(id) {
  return query('DELETE FROM photos WHERE id = $1', [id]);
}

async function movePhoto(photoId, targetAlbumId, paths) {
  // Placeholders numbered in reading order: the SQLite adapter binds them by position.
  await query(`UPDATE photos SET album_id = $1, original_path = $2, thumbnail_path = $3, sort_order = ${nextInAlbum(4)}
    WHERE id = $5`, [targetAlbumId, paths.originalPath, paths.thumbnailPath, targetAlbumId, photoId]);
  return getPhotoById(photoId);
}

async function reorderPhotos(ids, run) {
  await writeOrder('photos', ids, run);
}

async function updatePaths(photoId, paths) {
  await query('UPDATE photos SET original_path = $1, thumbnail_path = $2 WHERE id = $3',
    [paths.originalPath, paths.thumbnailPath, photoId]);
}

/** Random photos from public albums only, for the home page wall. */
async function listPublicShowcase(limit) {
  const { rows } = await query(`SELECT p.id, p.album_id AS "albumId", p.width, p.height
    FROM photos p JOIN albums a ON a.id = p.album_id
    WHERE a.visibility = 'public' ORDER BY RANDOM() LIMIT $1`, [limit]);
  return rows;
}

async function publicTotals() {
  const { rows } = await query(`SELECT CAST(COUNT(*) AS INTEGER) AS photos,
    CAST(COUNT(DISTINCT p.album_id) AS INTEGER) AS albums
    FROM photos p JOIN albums a ON a.id = p.album_id WHERE a.visibility = 'public'`);
  return rows[0];
}

async function listAllPaths() {
  const { rows } = await query(`SELECT id, album_id AS "albumId", original_path AS "originalPath",
    thumbnail_path AS "thumbnailPath" FROM photos`);
  return rows;
}

/** Removes photo rows (not files). */
async function deletePhotoRows(ids) {
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    await query(`DELETE FROM photos WHERE id IN (${chunk.map((_, n) => `$${n + 1}`).join(', ')})`, chunk);
  }
}

/** Deletes albums without photos (and collections left without albums). Returns the number of albums removed. */
async function deleteEmptyAlbums() {
  const { rows } = await query('SELECT id FROM albums a WHERE NOT EXISTS (SELECT 1 FROM photos p WHERE p.album_id = a.id)');
  for (const row of rows) await query('DELETE FROM albums WHERE id = $1', [row.id]);
  await query('DELETE FROM collections WHERE NOT EXISTS (SELECT 1 FROM albums a WHERE a.collection_id = collections.id)');
  return rows.length;
}

async function reassignUploader(fromUserId, toUserId) {
  await query('UPDATE photos SET uploaded_by = $1 WHERE uploaded_by = $2', [toUserId, fromUserId]);
}

module.exports = {
  createPhoto, getPhotoById, deletePhoto, movePhoto, updatePaths, reassignUploader, listPublicShowcase, publicTotals,
  listAllPaths, deletePhotoRows, deleteEmptyAlbums, reorderPhotos,
};
