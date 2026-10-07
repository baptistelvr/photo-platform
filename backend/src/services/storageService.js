const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const env = require('../config/env');

// Loaded lazily: local development never touches Vercel Blob.
let blobClient;
function blob() {
  blobClient ||= require('@vercel/blob');
  return blobClient;
}

const blobWriteOptions = { access: 'private', contentType: 'image/jpeg', addRandomSuffix: false, allowOverwrite: true };

function albumFolder(name) {
  const folder = String(name).normalize('NFKC').trim()
    .replace(/[\\/\0]/g, '-')
    .replace(/\.\./g, '-')
    .replace(/\s+/g, ' ');
  if (!folder || folder === '.' || folder.length > 120) throw new Error('Invalid album folder name');
  return folder;
}

function generateFilename() {
  return `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.jpg`;
}

function photoPaths(album, filename) {
  const folder = albumFolder(album.name);
  return {
    originalPath: `Pictures/${folder}/original/${filename}`,
    thumbnailPath: `Pictures/${folder}/thumbnails/${filename}`,
  };
}

function localPath(pathname) {
  const root = path.resolve(env.PICTURES_DIR);
  const absolutePath = path.resolve(root, pathname.replace(/^Pictures[\\/]/, ''));
  if (!absolutePath.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe path detected');
  return absolutePath;
}

async function writeLocal(pathname, buffer) {
  const target = localPath(pathname);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, buffer);
}

async function removeLocal(pathname) {
  await fsp.unlink(localPath(pathname)).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

async function storePhotoBuffers(album, originalBuffer, thumbnailBuffer) {
  const filename = generateFilename();
  const { originalPath, thumbnailPath } = photoPaths(album, filename);

  if (!env.USE_BLOB_STORAGE) {
    await writeLocal(originalPath, originalBuffer);
    await writeLocal(thumbnailPath, thumbnailBuffer);
  } else {
    await blob().put(originalPath, originalBuffer, blobWriteOptions);
    try {
      await blob().put(thumbnailPath, thumbnailBuffer, blobWriteOptions);
    } catch (error) {
      await blob().del(originalPath).catch(() => {});
      throw error;
    }
  }

  return { filename, originalRelative: originalPath, thumbnailRelative: thumbnailPath };
}

/** Returns a Node readable stream for the stored file, or null if it does not exist. */
async function readPhoto(pathname) {
  if (!env.USE_BLOB_STORAGE) {
    const absolutePath = localPath(pathname);
    try {
      await fsp.access(absolutePath);
    } catch {
      return null;
    }
    return fs.createReadStream(absolutePath);
  }

  const result = await blob().get(pathname, { access: 'private' });
  if (!result?.stream) return null;
  return Readable.fromWeb(result.stream);
}

async function deletePhotoFiles(photos) {
  const pathnames = [photos].flat().flatMap((photo) => [photo.originalPath, photo.thumbnailPath]).filter(Boolean);
  if (!pathnames.length) return;
  if (!env.USE_BLOB_STORAGE) {
    await Promise.all(pathnames.map(removeLocal));
    return;
  }
  // del() accepts a batch of pathnames; keep batches modest.
  for (let i = 0; i < pathnames.length; i += 100) {
    await blob().del(pathnames.slice(i, i + 100));
  }
}

async function movePhotoFiles(photo, targetAlbum) {
  const target = photoPaths(targetAlbum, photo.filename);
  if (target.originalPath === photo.originalPath && target.thumbnailPath === photo.thumbnailPath) return target;

  if (!env.USE_BLOB_STORAGE) {
    for (const [from, to] of [[photo.originalPath, target.originalPath], [photo.thumbnailPath, target.thumbnailPath]]) {
      const destination = localPath(to);
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      await fsp.rename(localPath(from), destination);
    }
    return target;
  }

  await blob().copy(photo.originalPath, target.originalPath, blobWriteOptions);
  await blob().copy(photo.thumbnailPath, target.thumbnailPath, blobWriteOptions);
  await blob().del([photo.originalPath, photo.thumbnailPath]).catch(() => {});
  return target;
}

module.exports = { storePhotoBuffers, readPhoto, deletePhotoFiles, movePhotoFiles, albumFolder };
