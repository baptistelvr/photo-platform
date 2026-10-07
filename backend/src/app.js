const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const env = require('./config/env');
const db = require('./config/db');
const { migrate } = require('./db/migrate');
const userRepository = require('./repositories/userRepository');
const { hashPassword } = require('./utils/password');
const { ConfigError, HttpError } = require('./utils/httpError');
const { loadUser } = require('./middlewares/auth');
const { sameOrigin } = require('./middlewares/sameOrigin');
const { notFound } = require('./middlewares/notFound');
const { errorHandler } = require('./middlewares/errorHandler');
const routes = require('./routes');

const SESSION_REFRESH_MS = 12 * 60 * 60 * 1000;

/**
 * Creates the first main administrator from ADMIN_NAME / ADMIN_EMAIL /
 * ADMIN_PASSWORD when the database has no user yet. Intended for the first
 * production deployment; remove the variables afterwards.
 */
async function bootstrapInitialAdmin() {
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!name && !email && !password) return;
  if (!name || !email || !password) {
    throw new ConfigError('Définissez ADMIN_NAME, ADMIN_EMAIL et ADMIN_PASSWORD ensemble pour créer le premier administrateur.');
  }
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 12 || password.length > 128) {
    throw new ConfigError('ADMIN_EMAIL doit être valide et ADMIN_PASSWORD contenir entre 12 et 128 caractères.');
  }
  if (await userRepository.countUsers() > 0) return;
  await userRepository.createInitialAdmin({ name, email, passwordHash: await hashPassword(password) });
}

async function runInitialization() {
  if (!env.SESSION_SECRET && env.NODE_ENV !== 'test') {
    throw new ConfigError('SESSION_SECRET manquant : ajoutez une valeur aléatoire longue dans les variables d’environnement.');
  }
  db.assertConfigured();
  await migrate();
  await bootstrapInitialAdmin();
}

// Runs once per process (i.e. once per cold start on Vercel); retried after a failure.
let initialization;
function initialize() {
  initialization ||= runInitialization().catch((error) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

function sessionStore() {
  if (db.dialect !== 'postgres') return new session.MemoryStore();
  const PostgresStore = require('connect-pg-simple')(session);
  return new PostgresStore({
    pool: db.pool,
    tableName: 'sessions',
    createTableIfMissing: false,
    pruneSessionInterval: false,
    // Without this every request (each thumbnail!) would issue an UPDATE and wait for it.
    disableTouch: true,
  });
}

function createApp() {
  const app = express();
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  if (env.FRONTEND_URL) {
    app.use(cors({ origin: env.FRONTEND_URL, credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
  }

  // Answers before sessions are touched, and reports a readable reason when the
  // deployment is misconfigured instead of crashing the function.
  app.get('/api/health', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      await initialize();
      res.json({ success: true, status: 'ok', database: db.dialect, storage: env.USE_BLOB_STORAGE ? 'vercel-blob' : 'local' });
    } catch (error) {
      const safe = error instanceof HttpError;
      if (!safe) console.error('Initialization failed:', error); // eslint-disable-line no-console
      res.status(503).json({
        success: false,
        status: 'error',
        error: safe ? error.error : 'INITIALIZATION_FAILED',
        message: safe ? error.message : 'Initialisation de la base de données impossible, consultez les logs du serveur.',
      });
    }
  });

  app.use('/api', (_req, _res, next) => {
    initialize().then(() => next(), next);
  });

  app.use(express.json({ limit: '100kb' }));
  app.use(session({
    name: 'photo.sid',
    secret: env.SESSION_SECRET || 'test-secret',
    resave: false,
    saveUninitialized: false,
    store: sessionStore(),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));
  // Sliding expiry: re-save the session at most twice a day instead of on every request.
  app.use((req, _res, next) => {
    if (req.session?.userId && Date.now() - (req.session.refreshedAt || 0) > SESSION_REFRESH_MS) {
      req.session.refreshedAt = Date.now();
    }
    next();
  });
  app.use(loadUser);
  app.use(sameOrigin);

  app.use('/api', routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp, initialize };
