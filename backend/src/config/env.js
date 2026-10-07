const path = require('node:path');

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 3000),
  DATABASE_URL: process.env.DATABASE_URL || process.env.POSTGRES_URL || path.join(process.cwd(), 'data.sqlite'),
  SESSION_SECRET: process.env.SESSION_SECRET || '',
  FRONTEND_URL: process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173'),
  PICTURES_DIR: process.env.PICTURES_DIR || path.join(process.cwd(), 'Pictures'),
  TRUST_PROXY: process.env.TRUST_PROXY === 'true' || Boolean(process.env.VERCEL),
  MAX_FILE_SIZE_BYTES: 1024 * 1024,
};

module.exports = env;
