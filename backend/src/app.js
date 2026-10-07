const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const PostgreSQLStore = require('connect-pg-simple')(session);
const env = require('./config/env');
const db = require('./config/db');
const routes = require('./routes');
const { notFound } = require('./middlewares/notFound');
const { errorHandler } = require('./middlewares/errorHandler');
const { migrate } = require('./db/migrate');
const userRepository = require('./repositories/userRepository');


async function createApp() {
  if (!env.SESSION_SECRET && env.NODE_ENV !== 'test') throw new Error('SESSION_SECRET is required.');
  db.assertProductionConfiguration();
  await migrate();
  const app = express();
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || (env.FRONTEND_URL && origin === env.FRONTEND_URL)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false }));

  const sessionStore = db.dialect === 'postgres'
    ? new PostgreSQLStore({ pool: db.pool, createTableIfMissing: true, tableName: 'sessions' })
    : new session.MemoryStore();
  app.use(session({
    name: 'photo.sid', secret: env.SESSION_SECRET || 'test-secret', resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 },
    store: sessionStore,
  }));

  app.use(async (req, _res, next) => {
    try {
      if (!req.session?.userId) { req.user = null; return next(); }
      const user = await userRepository.findById(req.session.userId);
      if (!user || user.status !== 'active') { req.user = null; return next(); }
      user.permissions = await userRepository.getPermissions(user.id);
      req.user = user;
      return next();
    } catch (error) { return next(error); }
  });

  app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    const referer = req.get('referer');
    if (env.NODE_ENV === 'test' && !origin && !referer) return next();
    let trusted = false;
    try {
      const expectedOrigin = `${req.protocol}://${req.get('host')}`;
      trusted = (origin && new URL(origin).origin === expectedOrigin)
        || (referer && new URL(referer).origin === expectedOrigin)
        || (!!env.FRONTEND_URL && ((origin && origin === env.FRONTEND_URL) || (referer && referer.startsWith(env.FRONTEND_URL))));
    } catch { trusted = false; }
    if (!trusted) return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Origine non autorisée' });
    return next();
  });

  app.get('/api/health', (_req, res) => res.json({ success: true, status: 'ok' }));
  app.use('/api', routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
