const sharp = require('sharp');
const { HttpError } = require('../utils/httpError');

async function normalizeJpeg(buffer) {
  try {
    const metadata = await sharp(buffer, { failOn: 'error' }).metadata();
    if (metadata.format !== 'jpeg') {
      throw new HttpError(400, 'INVALID_CONTENT', 'Contenu de fichier invalide (JPEG attendu)');
    }

    // rotate() applies the EXIF orientation so stored dimensions match what is displayed.
    const { data: normalized, info } = await sharp(buffer, { failOn: 'error' })
      .rotate()
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(normalized)
      .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();

    return { normalized, thumbnail, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'INVALID_CONTENT', 'Image illisible ou corrompue');
  }
}

module.exports = { normalizeJpeg };
