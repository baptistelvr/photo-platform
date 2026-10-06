const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const SQLiteStoreFactory = require('connect-sqlite3');
const env = require('./config/env');
const routes = require('./routes');
const { notFound } = require('./middlewares/notFound');
const { errorHandler } = require('./middlewares/errorHandler');
const { migrate } = require('./db/migrate');
const userRepository = require('./repositories/userRepository');

const SQLiteStore = SQLiteStoreFactory(session);

function createApp() {
  migrate();
  fs.mkdirSync(path.resolve(env.PICTURES_DIR), { recursive: true });

  const app = express();
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 600,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.use(
    session({
      name: 'photo.sid',
      secret: env.SESSION_SECRET || 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
      store: new SQLiteStore({ db: 'sessions.sqlite', dir: process.cwd() }),
    })
  );

  app.use((req, _res, next) => {
    if (!req.session?.userId) {
      req.user = null;
      return next();
    }
    const user = userRepository.findById(req.session.userId);
    if (!user || user.status !== 'active') {
      req.user = null;
      return next();
    }
    user.permissions = userRepository.getPermissions(user.id);
    req.user = user;
    next();
  });

  app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin') || '';
    const referer = req.get('referer') || '';
    if (env.NODE_ENV === 'test' && !origin && !referer) return next();
    const trusted = origin === env.FRONTEND_URL || referer.startsWith(env.FRONTEND_URL);
    if (!trusted) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Origine non autorisée',
      });
    }
    return next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, status: 'ok' });
  });

  app.use('/api', routes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
