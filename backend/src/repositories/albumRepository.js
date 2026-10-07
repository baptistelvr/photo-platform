const unwrap = (value) => value?.default ?? value;
const { query } = unwrap(require('../config/db'));

async function listAlbums() {
  const { rows } = await query(`SELECT a.id, a.name, a.description, a.cover_photo_id as "coverPhotoId", a.visibility,
    a.created_at as "createdAt", a.updated_at as "updatedAt", CAST(COUNT(p.id) AS INTEGER) as "photosCount"
    FROM albums a LEFT JOIN photos p ON p.album_id = a.id GROUP BY a.id ORDER BY a.created_at DESC`);
  return rows;
}

async function getAlbumById(id) {
  const { rows } = await query(`SELECT a.id, a.name, a.description, a.cover_photo_id as "coverPhotoId", a.visibility,
    a.password_hash as "passwordHash", a.created_at as "createdAt", a.updated_at as "updatedAt"
    FROM albums a WHERE a.id = $1`, [id]);
  return rows[0] || null;
}

async function createAlbum({ name, description, visibility, passwordHash }) {
  const { rows } = await query(`INSERT INTO albums (name, description, visibility, password_hash)
    VALUES ($1, $2, $3, $4) RETURNING id`, [name, description || null, visibility, passwordHash || null]);
  return getAlbumById(rows[0].id);
}

async function updateAlbum(id, { name, description, visibility, passwordHash, coverPhotoId }) {
  await query(`UPDATE albums SET name=$1, description=$2, visibility=$3, password_hash=$4,
    cover_photo_id=$5, updated_at=CAST(CURRENT_TIMESTAMP AS TEXT) WHERE id=$6`,
  [name, description || null, visibility, passwordHash || null, coverPhotoId || null, id]);
  return getAlbumById(id);
}

async function deleteAlbum(id) {
  return query('DELETE FROM albums WHERE id=$1', [id]);
}

async function listAlbumPhotos(albumId) {
  const { rows } = await query(`SELECT id, album_id as "albumId", filename, original_name as "originalName", size,
    mime_type as "mimeType", width, height, created_at as "createdAt" FROM photos
    WHERE album_id=$1 ORDER BY created_at DESC`, [albumId]);
  return rows;
}

async function getAlbumAccessUserIds(albumId) {
  const { rows } = await query('SELECT user_id as "userId" FROM album_access WHERE album_id=$1', [albumId]);
  return rows.map((row) => row.userId);
}

async function setAlbumAccess(albumId, userIds) {
  await query('DELETE FROM album_access WHERE album_id=$1', [albumId]);
  for (const userId of userIds) {
    await query('INSERT INTO album_access (album_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [albumId, userId]);
  }
}

async function userHasAlbumAccess(albumId, userId) {
  const { rows } = await query('SELECT 1 FROM album_access WHERE album_id=$1 AND user_id=$2', [albumId, userId]);
  return rows.length > 0;
}

module.exports = { listAlbums, getAlbumById, createAlbum, updateAlbum, deleteAlbum, listAlbumPhotos,
  getAlbumAccessUserIds, setAlbumAccess, userHasAlbumAccess };

