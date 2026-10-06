const { db } = require('../config/db');

function createPhoto(payload) {
  const result = db
    .prepare(
      `INSERT INTO photos (
        album_id, filename, original_name, original_path, thumbnail_path,
        size, mime_type, width, height, uploaded_by
      ) VALUES (
        @albumId, @filename, @originalName, @originalPath, @thumbnailPath,
        @size, @mimeType, @width, @height, @uploadedBy
      )`
    )
    .run(payload);

  return getPhotoById(result.lastInsertRowid);
}

function getPhotoById(id) {
  return db
    .prepare(
      `SELECT p.id, p.album_id as albumId, p.filename, p.original_name as originalName, p.original_path as originalPath,
              p.thumbnail_path as thumbnailPath, p.size, p.mime_type as mimeType, p.width, p.height,
              p.uploaded_by as uploadedBy, p.created_at as createdAt,
              a.visibility, a.password_hash as albumPasswordHash
       FROM photos p
       JOIN albums a ON a.id = p.album_id
       WHERE p.id = ?`
    )
    .get(id);
}

function deletePhoto(id) {
  return db.prepare('DELETE FROM photos WHERE id = ?').run(id);
}

function movePhoto(photoId, targetAlbumId) {
  db.prepare("UPDATE photos SET album_id = ?, created_at = created_at WHERE id = ?").run(targetAlbumId, photoId);
  return getPhotoById(photoId);
}

module.exports = { createPhoto, getPhotoById, deletePhoto, movePhoto };
