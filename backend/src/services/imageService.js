const sharp = require('sharp');

async function normalizeJpeg(buffer) {
  const image = sharp(buffer, { failOn: 'error' });
  const metadata = await image.metadata();
  const normalized = await image.rotate().jpeg({ quality: 90 }).toBuffer();
  const thumbnail = await sharp(normalized).resize({ width: 480, height: 480, fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();

  return {
    normalized,
    thumbnail,
    width: metadata.width || 0,
    height: metadata.height || 0,
  };
}

module.exports = { normalizeJpeg };
