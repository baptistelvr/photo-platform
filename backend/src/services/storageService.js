const unwrap = (value) => value?.default ?? value;
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { put, get, del } = require('@vercel/blob');
const env = unwrap(require('../config/env'));
const useBlob = Boolean(process.env.VERCEL || process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

function albumFolder(name) {
  const folder = String(name).normalize('NFKC').trim().replace(/[\\/\0]/g, '-')
    .replace(/\.\./g, '-').replace(/\s+/g, ' ');
  if (!folder || folder === '.' || folder.length > 120) throw new Error('Invalid album folder name');
  return folder;
}

function generateFilename() {
  return `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.jpg`;
}

async function storePhotoBuffers(album, originalBuffer, thumbnailBuffer) {
  const folder = albumFolder(album.name);
  const filename = generateFilename();
  const originalPath = `Pictures/${folder}/original/${filename}`;
  const thumbnailPath = `Pictures/${folder}/thumbnails/${filename}`;
  if (!useBlob) {
    const base = path.join(env.PICTURES_DIR, folder);
    await fs.mkdir(path.join(base, 'original'), { recursive: true });
    await fs.mkdir(path.join(base, 'thumbnails'), { recursive: true });
    await fs.writeFile(path.join(base, 'original', filename), originalBuffer);
    await fs.writeFile(path.join(base, 'thumbnails', filename), thumbnailBuffer);
    return { filename, originalRelative: originalPath, thumbnailRelative: thumbnailPath };
  }
  await put(originalPath, originalBuffer, { access: 'private', contentType: 'image/jpeg', addRandomSuffix: false });
  try {
    await put(thumbnailPath, thumbnailBuffer, { access: 'private', contentType: 'image/jpeg', addRandomSuffix: false });
  } catch (error) {
    await del(originalPath, { access: 'private' }).catch(() => {});
    throw error;
  }
  return { filename, originalRelative: originalPath, thumbnailRelative: thumbnailPath };
}

async function readPhoto(pathname) {
  if (!useBlob) {
    const relativePath = pathname.replace(/^Pictures[\\/]/, '');
    const absolutePath = path.resolve(env.PICTURES_DIR, relativePath);
    const root = path.resolve(env.PICTURES_DIR);
    if (!absolutePath.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe path detected');
    try { return { stream: require('node:fs').createReadStream(absolutePath) }; }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  return get(pathname, { access: 'private' });
}

async function deletePhotoFiles(photo) {
  if (!useBlob) {
    await Promise.all([photo.originalPath, photo.thumbnailPath].map(async (pathname) => {
      const relativePath = pathname.replace(/^Pictures[\\/]/, '');
      const absolutePath = path.resolve(env.PICTURES_DIR, relativePath);
      const root = path.resolve(env.PICTURES_DIR);
      if (!absolutePath.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe path detected');
      await fs.unlink(absolutePath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    }));
    return;
  }
  await Promise.all([photo.originalPath, photo.thumbnailPath].map((pathname) => del(pathname, { access: 'private' })));
}

async function movePhotoFiles(photo, targetAlbum) {
  const filename = photo.filename;
  const folder = albumFolder(targetAlbum.name);
  const originalPath = `Pictures/${folder}/original/${filename}`;
  const thumbnailPath = `Pictures/${folder}/thumbnails/${filename}`;
  const original = await readPhoto(photo.originalPath);
  const thumbnail = await readPhoto(photo.thumbnailPath);
  if (!original || !thumbnail) throw new Error('Photo file missing from private storage');
  const toBuffer = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  };
  const [originalBuffer, thumbnailBuffer] = await Promise.all([toBuffer(original.stream), toBuffer(thumbnail.stream)]);
  if (!useBlob) {
    for (const [pathname, buffer] of [[originalPath, originalBuffer], [thumbnailPath, thumbnailBuffer]]) {
      const relativePath = pathname.replace(/^Pictures\//, '');
      const absolutePath = path.resolve(env.PICTURES_DIR, relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, buffer);
    }
    await deletePhotoFiles(photo);
    return { originalPath, thumbnailPath };
  }
  await put(originalPath, originalBuffer, { access: 'private', contentType: 'image/jpeg', addRandomSuffix: false });
  try {
    await put(thumbnailPath, thumbnailBuffer, { access: 'private', contentType: 'image/jpeg', addRandomSuffix: false });
  } catch (error) {
    await del(originalPath, { access: 'private' }).catch(() => {});
    throw error;
  }
  await deletePhotoFiles(photo);
  return { originalPath, thumbnailPath };
}

module.exports = { storePhotoBuffers, readPhoto, deletePhotoFiles, movePhotoFiles, albumFolder };

