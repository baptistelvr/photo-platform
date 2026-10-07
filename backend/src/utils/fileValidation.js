const unwrap = (value) => value?.default ?? value;
const path = require('node:path');
const { fileTypeFromBuffer } = require('file-type');
const env = unwrap(require('../config/env'));
const { HttpError } = unwrap(require('./httpError'));

const allowedMimeTypes = new Set(['image/jpeg']);
const allowedExtensions = new Set(['.jpg', '.jpeg']);

async function validateJpegUpload(file) {
  if (!file) {
    throw new HttpError(400, 'MISSING_FILE', 'Aucun fichier envoyé');
  }

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

  const detectedType = await fileTypeFromBuffer(file.buffer);
  if (!detectedType || detectedType.mime !== 'image/jpeg') {
    throw new HttpError(400, 'INVALID_CONTENT', 'Contenu de fichier invalide (JPEG attendu)');
  }
}

module.exports = { validateJpegUpload };

