// Must match the API limit (backend/src/config/env.js).
export const MAX_UPLOAD_BYTES = 1024 * 1024;

const JPEG_NAME = /\.jpe?g$/i;
const JPEG_TYPE = /^image\/p?jpe?g$/;

/** Hidden files and macOS "._" resource forks look like photos but are not. */
export function isHiddenFile(name) {
  return name.startsWith('.') || name === 'Thumbs.db' || name === 'desktop.ini';
}

export function isJpegFile(file) {
  return JPEG_NAME.test(file.name) && (!file.type || JPEG_TYPE.test(file.type));
}

/**
 * Returns the file unchanged when it fits the upload limit, otherwise a
 * re-encoded JPEG small enough to be accepted. EXIF orientation is applied
 * while decoding, so the result is already upright.
 */
export async function shrinkToLimit(file, limit = MAX_UPLOAD_BYTES) {
  if (file.size <= limit) return file;
  const target = limit * 0.97;
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    let maxSide = 2560;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement('canvas'), { width, height });
      canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);

      for (const quality of [0.86, 0.76, 0.66]) {
        const blob = canvas.convertToBlob
          ? await canvas.convertToBlob({ type: 'image/jpeg', quality })
          : await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob && blob.size <= target) {
          return new File([blob], file.name, { type: 'image/jpeg', lastModified: file.lastModified });
        }
      }
      maxSide = Math.round(maxSide * 0.75);
    }
  } finally {
    bitmap.close?.();
  }
  throw new Error('Impossible de réduire cette photo sous 1 Mo');
}

/**
 * Captures the dropped entries. Must be called synchronously inside the drop
 * handler: the DataTransfer is emptied once the event returns.
 */
export function captureDrop(dataTransfer) {
  const entries = Array.from(dataTransfer.items || [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean);
  const files = Array.from(dataTransfer.files || []);
  return { entries, files };
}

const readEntries = (reader) => new Promise((resolve, reject) => reader.readEntries(resolve, reject));
const entryFile = (entry) => new Promise((resolve, reject) => entry.file(resolve, reject));

/** Walks dropped folders recursively. Returns [{ file, path }] with paths like "Root/Sub/photo.jpg". */
export async function filesFromDrop({ entries, files }) {
  if (!entries.length) return files.map((file) => ({ file, path: file.name }));
  const results = [];
  async function walk(entry) {
    if (entry.isFile) {
      results.push({ file: await entryFile(entry), path: entry.fullPath.replace(/^\/+/, '') });
      return;
    }
    if (!entry.isDirectory) return;
    const reader = entry.createReader();
    // readEntries returns results in batches (100 in Chrome) until it yields an empty one.
    for (let batch = await readEntries(reader); batch.length; batch = await readEntries(reader)) {
      for (const child of batch) await walk(child);
    }
  }
  for (const entry of entries) await walk(entry);
  return results;
}

/** Files picked with <input webkitdirectory>. */
export function filesFromInput(fileList) {
  return Array.from(fileList || []).map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}

export function normalizeName(name) {
  return name.normalize('NFC').trim().toLowerCase();
}

/**
 * Turns a folder tree into collections.
 * - One folder containing sub-folders: each sub-folder is a collection; photos
 *   sitting directly in the root folder go to a collection named after it.
 * - Several folders, or one folder without sub-folders: each folder is a collection.
 * Deeper levels are merged into their collection. Files outside any folder are
 * returned separately in `loose`.
 */
export function groupIntoCollections(items) {
  const withDirs = [];
  const loose = [];
  let skipped = 0;

  for (const { file, path } of items) {
    const parts = path.split('/').filter(Boolean);
    const name = parts[parts.length - 1] || file.name;
    if (isHiddenFile(name)) continue;
    if (!isJpegFile(file)) {
      skipped += 1;
      continue;
    }
    const dirs = parts.slice(0, -1);
    if (dirs.length) withDirs.push({ file, dirs });
    else loose.push(file);
  }

  const tops = new Set(withDirs.map((item) => item.dirs[0]));
  const singleRoot = tops.size === 1 && withDirs.some((item) => item.dirs.length > 1);

  const groups = new Map();
  for (const { file, dirs } of withDirs) {
    const raw = singleRoot && dirs.length > 1 ? dirs[1] : dirs[0];
    const label = raw.trim().slice(0, 120) || 'Sans titre';
    const key = normalizeName(label);
    if (!groups.has(key)) groups.set(key, { key, name: label, files: [] });
    groups.get(key).files.push(file);
  }

  const sorted = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
  return { groups: sorted, loose, skipped };
}

/** Runs async tasks with at most `limit` in flight; stops picking new ones when shouldStop() is true. */
export async function runPool(tasks, limit, shouldStop = () => false) {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length && !shouldStop()) {
      const task = tasks[next];
      next += 1;
      await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}
