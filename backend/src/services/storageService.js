const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const env = require('../config/env');

async function ensureAlbumDirs(albumId) {
  const albumDir = path.join(env.PICTURES_DIR, `album-${albumId}`);
  const originalDir = path.join(albumDir, 'original');
  const thumbnailDir = path.join(albumDir, 'thumbnails');
  await fs.mkdir(originalDir, { recursive: true });
  await fs.mkdir(thumbnailDir, { recursive: true });
  return { albumDir, originalDir, thumbnailDir };
}

function generateFilename() {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.jpg`;
}

async function storePhotoBuffers(albumId, originalBuffer, thumbnailBuffer) {
  const dirs = await ensureAlbumDirs(albumId);
  const filename = generateFilename();
  const originalRelative = path.join(`album-${albumId}`, 'original', filename);
  const thumbnailRelative = path.join(`album-${albumId}`, 'thumbnails', filename);
  await fs.writeFile(path.join(env.PICTURES_DIR, originalRelative), originalBuffer);
  await fs.writeFile(path.join(env.PICTURES_DIR, thumbnailRelative), thumbnailBuffer);
  return { filename, originalRelative, thumbnailRelative };
}

async function movePhotoFiles(photo, targetAlbumId) {
  const dirs = await ensureAlbumDirs(targetAlbumId);
  const sourceOriginal = path.join(env.PICTURES_DIR, photo.originalPath);
  const sourceThumb = path.join(env.PICTURES_DIR, photo.thumbnailPath);
  const targetOriginal = path.join(dirs.originalDir, photo.filename);
  const targetThumb = path.join(dirs.thumbnailDir, photo.filename);
  await fs.rename(sourceOriginal, targetOriginal);
  await fs.rename(sourceThumb, targetThumb);
  return {
    originalPath: path.join(`album-${targetAlbumId}`, 'original', photo.filename),
    thumbnailPath: path.join(`album-${targetAlbumId}`, 'thumbnails', photo.filename),
  };
}

async function deletePhotoFiles(photo) {
  await Promise.allSettled([
    fs.unlink(path.join(env.PICTURES_DIR, photo.originalPath)),
    fs.unlink(path.join(env.PICTURES_DIR, photo.thumbnailPath)),
  ]);
}

function resolveSafePath(relativePath) {
  const absolute = path.resolve(env.PICTURES_DIR, relativePath);
  const root = path.resolve(env.PICTURES_DIR);
  if (!absolute.startsWith(root)) {
    throw new Error('Unsafe path detected');
  }
  return absolute;
}

module.exports = {
  ensureAlbumDirs,
  storePhotoBuffers,
  movePhotoFiles,
  deletePhotoFiles,
  resolveSafePath,
};
