const path = require('node:path');
const env = require('../config/env');
const { HttpError } = require('./httpError');

const allowedMimeTypes = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg']);
const allowedExtensions = new Set(['.jpg', '.jpeg']);

// Every JPEG starts with the SOI marker followed by another marker (FF D8 FF).
// Checked here directly: the `file-type` package is ESM-only and crashed the
// CommonJS function on Vercel. sharp then decodes the full image.
function hasJpegSignature(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function validateJpegUpload(file) {
  if (!file) throw new HttpError(400, 'MISSING_FILE', 'Aucun fichier envoyé');

  if (file.size > env.MAX_FILE_SIZE_BYTES) {
    throw new HttpError(413, 'FILE_TOO_LARGE', 'Fichier supérieur à 1 Mo');
  }

  const extension = path.extname(file.originalname || '').toLowerCase();
  if (!allowedExtensions.has(extension)) {
    throw new HttpError(400, 'INVALID_EXTENSION', 'Extension non autorisée (JPEG uniquement)');
  }

  if (!allowedMimeTypes.has(file.mimetype)) {
    throw new HttpError(400, 'INVALID_MIME', 'Type MIME non autorisé (JPEG uniquement)');
  }

  if (!hasJpegSignature(file.buffer)) {
    throw new HttpError(400, 'INVALID_CONTENT', 'Contenu de fichier invalide (JPEG attendu)');
  }
}

module.exports = { validateJpegUpload, hasJpegSignature };
