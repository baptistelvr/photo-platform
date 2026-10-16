const { query } = require('../config/db');

// A photo added to an album goes at its end. Two uploads landing at the same
// time may share a place; the photo id then keeps them in upload order.
const nextInAlbum = (param) => `(SELECT COALESCE(MAX(sort_order), -1) + 1 FROM album_photos WHERE album_id = $${param})`;

async function addToAlbum(photoId, albumId) {
  await query(`INSERT INTO album_photos (album_id, photo_id, sort_order) VALUES ($1, $2, ${nextInAlbum(3)})
    ON CONFLICT (album_id, photo_id) DO NOTHING`, [albumId, photoId, albumId]);
}

async function removeFromAlbum(photoId, albumId) {
  await query('DELETE FROM album_photos WHERE album_id = $1 AND photo_id = $2', [albumId, photoId]);
}

async function listPhotoAlbumIds(photoId) {
  const { rows } = await query('SELECT album_id AS "albumId" FROM album_photos WHERE photo_id = $1 ORDER BY album_id', [photoId]);
  return rows.map((row) => row.albumId);
}

/** The files live in `albumId`'s folder; the photo is also added to that album. */
async function createPhoto(payload) {
  const { rows } = await query(`INSERT INTO photos (album_id, filename, original_name, original_path, thumbnail_path,
    size, mime_type, width, height, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
  [payload.albumId, payload.filename, payload.originalName, payload.originalPath, payload.thumbnailPath,
    payload.size, payload.mimeType, payload.width, payload.height, payload.uploadedBy]);
  await addToAlbum(rows[0].id, payload.albumId);
  return getPhotoById(rows[0].id);
}

async function getPhotoById(id) {
  const { rows } = await query(`SELECT p.id, p.album_id AS "albumId", p.album_id AS "homeAlbumId", p.filename,
    p.original_name AS "originalName", p.original_path AS "originalPath", p.thumbnail_path AS "thumbnailPath", p.size,
    p.mime_type AS "mimeType", p.width, p.height, p.uploaded_by AS "uploadedBy", p.created_at AS "createdAt"
    FROM photos p WHERE p.id = $1`, [id]);
  return rows[0] || null;
}

async function deletePhoto(id) {
  return query('DELETE FROM photos WHERE id = $1', [id]);
}

/** The album whose folder holds the files changes (after the files were moved there). */
async function setHomeAlbum(photoId, albumId, paths) {
  await query('UPDATE photos SET album_id = $1, original_path = $2, thumbnail_path = $3 WHERE id = $4',
    [albumId, paths.originalPath, paths.thumbnailPath, photoId]);
}

/** Positions 0, 1, 2… inside one album, in the order of `ids`. */
async function reorderPhotos(albumId, ids, run = query) {
  for (let start = 0; start < ids.length; start += 400) {
    const chunk = ids.slice(start, start + 400);
    const cases = chunk.map((_, i) => `WHEN $${i + 1} THEN ${start + i}`).join(' ');
    const list = chunk.map((_, i) => `$${chunk.length + i + 1}`).join(', ');
    await run(`UPDATE album_photos SET sort_order = CASE photo_id ${cases} END
      WHERE photo_id IN (${list}) AND album_id = $${chunk.length * 2 + 1}`, [...chunk, ...chunk, albumId]);
  }
}

async function updatePaths(photoId, paths) {
  await query('UPDATE photos SET original_path = $1, thumbnail_path = $2 WHERE id = $3',
    [paths.originalPath, paths.thumbnailPath, photoId]);
}

/**
 * Where the home page wall takes its photos: every public album, or only the
 * chosen ones (still public only). A photo seen through several of them counts once.
 */
// Open to everyone: a public album outside any locked collection.
const OPEN_ALBUM = "a.visibility = 'public' AND COALESCE(c.visibility, 'public') = 'public'";
const SHOWCASE_FROM = `photos p JOIN album_photos ap ON ap.photo_id = p.id JOIN albums a ON a.id = ap.album_id
    LEFT JOIN collections c ON c.id = a.collection_id`;

function showcaseFilter(albumIds) {
  if (!albumIds) return { where: OPEN_ALBUM, params: [] };
  if (!albumIds.length) return { where: '1 = 0', params: [] };
  return {
    where: `${OPEN_ALBUM} AND a.id IN (${albumIds.map((_, i) => `$${i + 1}`).join(', ')})`,
    params: albumIds,
  };
}

async function listPublicShowcase(limit, albumIds = null) {
  const { where, params } = showcaseFilter(albumIds);
  const { rows } = await query(`SELECT p.id, MIN(a.id) AS "albumId", p.width, p.height
    FROM ${SHOWCASE_FROM}
    WHERE ${where} GROUP BY p.id, p.width, p.height ORDER BY RANDOM() LIMIT $${params.length + 1}`, [...params, limit]);
  return rows;
}

async function publicTotals(albumIds = null) {
  const { where, params } = showcaseFilter(albumIds);
  const { rows } = await query(`SELECT CAST(COUNT(DISTINCT p.id) AS INTEGER) AS photos,
    CAST(COUNT(DISTINCT a.id) AS INTEGER) AS albums
    FROM ${SHOWCASE_FROM} WHERE ${where}`, params);
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

/**
 * Deletes albums left with neither photos nor sub-albums, from the bottom of the
 * tree up, then collections left without albums. Returns the number of albums removed.
 */
async function deleteEmptyAlbums() {
  let removed = 0;
  for (;;) {
    const { rows } = await query(`SELECT id FROM albums a
      WHERE NOT EXISTS (SELECT 1 FROM album_photos ap WHERE ap.album_id = a.id)
        AND NOT EXISTS (SELECT 1 FROM albums c WHERE c.parent_id = a.id)`);
    if (!rows.length) break;
    for (const row of rows) await query('DELETE FROM albums WHERE id = $1', [row.id]);
    removed += rows.length;
  }
  await query('DELETE FROM collections WHERE NOT EXISTS (SELECT 1 FROM albums a WHERE a.collection_id = collections.id)');
  return removed;
}

async function reassignUploader(fromUserId, toUserId) {
  await query('UPDATE photos SET uploaded_by = $1 WHERE uploaded_by = $2', [toUserId, fromUserId]);
}

module.exports = {
  createPhoto, getPhotoById, deletePhoto, setHomeAlbum, addToAlbum, removeFromAlbum, listPhotoAlbumIds, updatePaths,
  reassignUploader, listPublicShowcase, publicTotals, listAllPaths, deletePhotoRows, deleteEmptyAlbums, reorderPhotos,
};
