const { db } = require('../config/db');

function listAlbums() {
  return db
    .prepare(
      `SELECT a.id, a.name, a.description, a.cover_photo_id as coverPhotoId, a.visibility, a.created_at as createdAt, a.updated_at as updatedAt,
              COUNT(p.id) as photosCount
       FROM albums a
       LEFT JOIN photos p ON p.album_id = a.id
       GROUP BY a.id
       ORDER BY a.created_at DESC`
    )
    .all();
}

function getAlbumById(id) {
  return db
    .prepare(
      `SELECT a.id, a.name, a.description, a.cover_photo_id as coverPhotoId, a.visibility, a.password_hash as passwordHash,
              a.created_at as createdAt, a.updated_at as updatedAt
       FROM albums a
       WHERE a.id = ?`
    )
    .get(id);
}

function createAlbum({ name, description, visibility, passwordHash }) {
  const result = db
    .prepare(
      `INSERT INTO albums (name, description, visibility, password_hash)
       VALUES (?, ?, ?, ?)`
    )
    .run(name, description || null, visibility, passwordHash || null);

  return getAlbumById(result.lastInsertRowid);
}

function updateAlbum(id, { name, description, visibility, passwordHash, coverPhotoId }) {
  db.prepare(
    `UPDATE albums
     SET name = ?, description = ?, visibility = ?, password_hash = ?, cover_photo_id = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(name, description || null, visibility, passwordHash || null, coverPhotoId || null, id);

  return getAlbumById(id);
}

function deleteAlbum(id) {
  return db.prepare('DELETE FROM albums WHERE id = ?').run(id);
}

function listAlbumPhotos(albumId) {
  return db
    .prepare(
      `SELECT id, album_id as albumId, filename, original_name as originalName, size, mime_type as mimeType,
              width, height, created_at as createdAt
       FROM photos
       WHERE album_id = ?
       ORDER BY created_at DESC`
    )
    .all(albumId);
}

function getAlbumAccessUserIds(albumId) {
  return db.prepare('SELECT user_id as userId FROM album_access WHERE album_id = ?').all(albumId).map((row) => row.userId);
}

function setAlbumAccess(albumId, userIds) {
  db.prepare('DELETE FROM album_access WHERE album_id = ?').run(albumId);
  const stmt = db.prepare('INSERT OR IGNORE INTO album_access (album_id, user_id) VALUES (?, ?)');
  userIds.forEach((userId) => stmt.run(albumId, userId));
}

function userHasAlbumAccess(albumId, userId) {
  return Boolean(db.prepare('SELECT 1 FROM album_access WHERE album_id = ? AND user_id = ?').get(albumId, userId));
}

module.exports = {
  listAlbums,
  getAlbumById,
  createAlbum,
  updateAlbum,
  deleteAlbum,
  listAlbumPhotos,
  getAlbumAccessUserIds,
  setAlbumAccess,
  userHasAlbumAccess,
};
