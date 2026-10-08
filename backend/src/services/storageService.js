const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const env = require('../config/env');
const { ConfigError } = require('../utils/httpError');

/*
 * Two interchangeable drivers with the same small interface:
 *   put(key, buffer) · get(key) → readable stream | null · remove(keys) ·
 *   copy(from, to) · list(prefix) → Set of keys
 * Keys look like "Pictures/<collection>/<album>/original/<file>.jpg".
 */

function localDriver() {
  const root = path.resolve(env.PICTURES_DIR);
  const toPath = (key) => {
    const absolute = path.resolve(root, key.replace(/^Pictures[\\/]/, ''));
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe path detected');
    return absolute;
  };

  return {
    name: 'local',
    async put(key, buffer) {
      const target = toPath(key);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, buffer);
    },
    async get(key) {
      const absolute = toPath(key);
      try {
        await fsp.access(absolute);
      } catch {
        return null;
      }
      return fs.createReadStream(absolute);
    },
    async remove(keys) {
      await Promise.all(keys.map((key) => fsp.unlink(toPath(key)).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      })));
    },
    async copy(from, to) {
      const target = toPath(to);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.copyFile(toPath(from), target);
    },
    async list() {
      const keys = new Set();
      async function walk(dir) {
        let entries;
        try {
          entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch (error) {
          if (error.code === 'ENOENT') return;
          throw error;
        }
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) await walk(full);
          else keys.add(`Pictures/${path.relative(root, full).split(path.sep).join('/')}`);
        }
      }
      await walk(root);
      return keys;
    },
  };
}

function s3Driver() {
  // Loaded only when used, so local development never needs S3 credentials.
  const {
    S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand, ListObjectsV2Command,
  } = require('@aws-sdk/client-s3');
  const { bucket } = env.S3;
  const client = new S3Client({
    region: env.S3.region,
    endpoint: env.S3.endpoint || undefined,
    forcePathStyle: env.S3.forcePathStyle,
    credentials: { accessKeyId: env.S3.accessKeyId, secretAccessKey: env.S3.secretAccessKey },
    // Recent SDKs add CRC checksums to every request; R2, B2 and MinIO do not all accept them.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const isMissing = (error) => error?.name === 'NoSuchKey' || error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404;
  // CopySource is "bucket/key" with each path segment URL-encoded (album names contain spaces and accents).
  const copySource = (key) => `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

  return {
    name: 's3',
    async put(key, buffer) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: 'image/jpeg' }));
    },
    async get(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return result.Body;
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async remove(keys) {
      // One request per key: DeleteObjects needs checksum headers that not every provider accepts.
      for (let i = 0; i < keys.length; i += 8) {
        await Promise.all(keys.slice(i, i + 8).map((key) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))));
      }
    },
    async copy(from, to) {
      await client.send(new CopyObjectCommand({ Bucket: bucket, Key: to, CopySource: copySource(from) }));
    },
    async list(prefix) {
      const keys = new Set();
      let token;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        for (const object of page.Contents || []) keys.add(object.Key);
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return keys;
    },
  };
}

let driver;
function storage() {
  driver ||= env.STORAGE === 's3' ? s3Driver() : localDriver();
  return driver;
}

/** Throws a readable error when the deployment has no usable photo storage. */
function assertConfigured() {
  if (env.STORAGE === 's3') {
    const missing = ['endpoint', 'accessKeyId', 'secretAccessKey']
      .filter((key) => !env.S3[key])
      .map((key) => ({ endpoint: 'S3_ENDPOINT', accessKeyId: 'S3_ACCESS_KEY_ID', secretAccessKey: 'S3_SECRET_ACCESS_KEY' })[key]);
    if (missing.length) throw new ConfigError(`Stockage S3 incomplet : ajoutez ${missing.join(', ')}.`);
    return;
  }
  if (env.IS_VERCEL) {
    throw new ConfigError('Stockage des photos manquant : configurez un bucket S3 (Cloudflare R2 ou Backblaze B2) avec S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID et S3_SECRET_ACCESS_KEY.');
  }
}

function describe() {
  if (env.STORAGE !== 's3') return { driver: 'local' };
  let host = env.S3.endpoint;
  try {
    host = new URL(env.S3.endpoint).host;
  } catch {
    // Keep the raw value.
  }
  return { driver: 's3', bucket: env.S3.bucket, endpoint: host };
}

function folderName(name) {
  const folder = String(name).normalize('NFKC').trim()
    .replace(/[\\/\0]/g, '-')
    .replace(/\.\./g, '-')
    .replace(/\s+/g, ' ');
  if (!folder || folder === '.' || folder.length > 120) throw new Error('Invalid folder name');
  return folder;
}

/** "Pictures/<collection>/<album>/…" — the collection level is omitted for albums outside any collection. */
function photoPaths(album, filename) {
  const base = ['Pictures', album.collectionName && folderName(album.collectionName), folderName(album.name)]
    .filter(Boolean)
    .join('/');
  return {
    originalPath: `${base}/original/${filename}`,
    thumbnailPath: `${base}/thumbnails/${filename}`,
  };
}

function generateFilename() {
  return `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.jpg`;
}

async function storePhotoBuffers(album, originalBuffer, thumbnailBuffer) {
  const filename = generateFilename();
  const { originalPath, thumbnailPath } = photoPaths(album, filename);
  await storage().put(originalPath, originalBuffer);
  try {
    await storage().put(thumbnailPath, thumbnailBuffer);
  } catch (error) {
    await storage().remove([originalPath]).catch(() => {});
    throw error;
  }
  return { filename, originalRelative: originalPath, thumbnailRelative: thumbnailPath };
}

function readPhoto(key) {
  return storage().get(key);
}

async function deletePhotoFiles(photos) {
  const keys = [photos].flat().flatMap((photo) => [photo.originalPath, photo.thumbnailPath]).filter(Boolean);
  if (keys.length) await storage().remove(keys);
}

/** Moves a photo's files under the target album's folder; returns the new paths. */
async function movePhotoFiles(photo, targetAlbum) {
  const target = photoPaths(targetAlbum, photo.filename);
  if (target.originalPath === photo.originalPath && target.thumbnailPath === photo.thumbnailPath) return target;
  await storage().copy(photo.originalPath, target.originalPath);
  await storage().copy(photo.thumbnailPath, target.thumbnailPath);
  await storage().remove([photo.originalPath, photo.thumbnailPath]).catch(() => {});
  return target;
}

function listStoredKeys() {
  return storage().list('Pictures/');
}

module.exports = {
  assertConfigured,
  describe,
  photoPaths,
  storePhotoBuffers,
  readPhoto,
  deletePhotoFiles,
  movePhotoFiles,
  listStoredKeys,
};
