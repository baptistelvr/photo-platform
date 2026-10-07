const path = require('node:path');

const isVercel = Boolean(process.env.VERCEL);
const nodeEnv = process.env.NODE_ENV || 'development';

// The Neon integration on Vercel exposes POSTGRES_URL / POSTGRES_DATABASE_URL
// rather than DATABASE_URL, so accept every name it may use.
const databaseUrl = process.env.DATABASE_URL
  || process.env.POSTGRES_URL
  || process.env.POSTGRES_DATABASE_URL
  || (isVercel ? '' : path.join(process.cwd(), 'data.sqlite'));

const env = {
  NODE_ENV: nodeEnv,
  IS_VERCEL: isVercel,
  PORT: Number(process.env.PORT || 3000),
  DATABASE_URL: databaseUrl,
  SESSION_SECRET: process.env.SESSION_SECRET || '',
  FRONTEND_URL: process.env.FRONTEND_URL || (nodeEnv === 'production' ? '' : 'http://localhost:5173'),
  PICTURES_DIR: process.env.PICTURES_DIR || path.join(process.cwd(), 'Pictures'),
  TRUST_PROXY: process.env.TRUST_PROXY === 'true' || isVercel,
  USE_BLOB_STORAGE: Boolean(isVercel || process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
  HAS_BLOB_CREDENTIALS: Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
  MAX_FILE_SIZE_BYTES: 1024 * 1024,
  // Vercel Functions reject request bodies above 4.5 MB, so keep a batch well under that.
  MAX_FILES_PER_UPLOAD: 4,
};

module.exports = env;
