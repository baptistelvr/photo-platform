const unwrap = (value) => value?.default ?? value;
const { query } = unwrap(require('../config/db'));

async function createPhoto(payload) {
  const { rows } = await query(`INSERT INTO photos (album_id,filename,original_name,original_path,thumbnail_path,
    size,mime_type,width,height,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
  [payload.albumId, payload.filename, payload.originalName, payload.originalPath, payload.thumbnailPath,
    payload.size, payload.mimeType, payload.width, payload.height, payload.uploadedBy]);
  return getPhotoById(rows[0].id);
}
async function getPhotoById(id) {
  const { rows } = await query(`SELECT p.id,p.album_id as "albumId",p.filename,p.original_name as "originalName",
    p.original_path as "originalPath",p.thumbnail_path as "thumbnailPath",p.size,p.mime_type as "mimeType",
    p.width,p.height,p.uploaded_by as "uploadedBy",p.created_at as "createdAt",a.visibility,
    a.password_hash as "albumPasswordHash" FROM photos p JOIN albums a ON a.id=p.album_id WHERE p.id=$1`, [id]);
  return rows[0] || null;
}
async function deletePhoto(id) { return query('DELETE FROM photos WHERE id=$1', [id]); }
async function movePhoto(photoId, targetAlbumId, paths) {
  await query('UPDATE photos SET album_id=$1,original_path=$2,thumbnail_path=$3 WHERE id=$4',
    [targetAlbumId, paths.originalPath, paths.thumbnailPath, photoId]);
  return getPhotoById(photoId);
}

module.exports = { createPhoto, getPhotoById, deletePhoto, movePhoto };

