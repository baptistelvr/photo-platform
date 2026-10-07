const { query } = require('../config/db');

const albumColumns = `a.id, a.name, a.description, a.cover_photo_id AS "coverPhotoId", a.visibility,
  a.password_hash AS "passwordHash", a.created_at AS "createdAt", a.updated_at AS "updatedAt"`;

async function listAlbums() {
  const { rows } = await query(`SELECT ${albumColumns},
      CAST((SELECT COUNT(*) FROM photos p WHERE p.album_id = a.id) AS INTEGER) AS "photosCount",
      (SELECT p.id FROM photos p WHERE p.album_id = a.id ORDER BY p.created_at DESC, p.id DESC LIMIT 1) AS "latestPhotoId"
    FROM albums a ORDER BY a.created_at DESC, a.id DESC`);
  return rows;
}

async function getAlbumById(id) {
  const { rows } = await query(`SELECT ${albumColumns},
      CAST((SELECT COUNT(*) FROM photos p WHERE p.album_id = a.id) AS INTEGER) AS "photosCount",
      (SELECT p.id FROM photos p WHERE p.album_id = a.id ORDER BY p.created_at DESC, p.id DESC LIMIT 1) AS "latestPhotoId"
    FROM albums a WHERE a.id = $1`, [id]);
  return rows[0] || null;
}

async function createAlbum({ name, description, visibility, passwordHash }) {
  const { rows } = await query(`INSERT INTO albums (name, description, visibility, password_hash)
    VALUES ($1, $2, $3, $4) RETURNING id`, [name, description || null, visibility, passwordHash || null]);
  return getAlbumById(rows[0].id);
}

async function updateAlbum(id, { name, description, visibility, passwordHash, coverPhotoId }) {
  await query(`UPDATE albums SET name = $1, description = $2, visibility = $3, password_hash = $4,
    cover_photo_id = $5, updated_at = CAST(CURRENT_TIMESTAMP AS TEXT) WHERE id = $6`,
  [name, description || null, visibility, passwordHash || null, coverPhotoId || null, id]);
  return getAlbumById(id);
}

async function clearCoverPhoto(photoId) {
  await query('UPDATE albums SET cover_photo_id = NULL WHERE cover_photo_id = $1', [photoId]);
}

async function deleteAlbum(id) {
  return query('DELETE FROM albums WHERE id = $1', [id]);
}

async function listAlbumPhotos(albumId) {
  const { rows } = await query(`SELECT id, album_id AS "albumId", filename, original_name AS "originalName", size,
    mime_type AS "mimeType", width, height, original_path AS "originalPath", thumbnail_path AS "thumbnailPath",
    created_at AS "createdAt" FROM photos WHERE album_id = $1 ORDER BY created_at DESC, id DESC`, [albumId]);
  return rows;
}

async function getAlbumAccessUserIds(albumId) {
  const { rows } = await query('SELECT user_id AS "userId" FROM album_access WHERE album_id = $1', [albumId]);
  return rows.map((row) => row.userId);
}

async function setAlbumAccess(albumId, userIds) {
  await query('DELETE FROM album_access WHERE album_id = $1', [albumId]);
  for (const userId of new Set(userIds)) {
    await query('INSERT INTO album_access (album_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [albumId, userId]);
  }
}

async function setUserAlbumAccess(userId, albumIds) {
  await query('DELETE FROM album_access WHERE user_id = $1', [userId]);
  for (const albumId of new Set(albumIds)) {
    await query(
      'INSERT INTO album_access (album_id, user_id) SELECT id, $2 FROM albums WHERE id = $1 ON CONFLICT DO NOTHING',
      [albumId, userId],
    );
  }
}

async function listAccessByUser() {
  const { rows } = await query('SELECT user_id AS "userId", album_id AS "albumId" FROM album_access');
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.userId)) map.set(row.userId, []);
    map.get(row.userId).push(row.albumId);
  }
  return map;
}

async function listAccessibleAlbumIds(userId) {
  const { rows } = await query('SELECT album_id AS "albumId" FROM album_access WHERE user_id = $1', [userId]);
  return rows.map((row) => row.albumId);
}

async function userHasAlbumAccess(albumId, userId) {
  const { rows } = await query('SELECT 1 FROM album_access WHERE album_id = $1 AND user_id = $2', [albumId, userId]);
  return rows.length > 0;
}

module.exports = {
  listAlbums,
  getAlbumById,
  createAlbum,
  updateAlbum,
  clearCoverPhoto,
  deleteAlbum,
  listAlbumPhotos,
  getAlbumAccessUserIds,
  setAlbumAccess,
  setUserAlbumAccess,
  listAccessByUser,
  listAccessibleAlbumIds,
  userHasAlbumAccess,
};
