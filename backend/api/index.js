const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const PostgreSQLStore = require('connect-pg-simple')(session);
const envModule = require('../src/config/env.js');
const unwrapDefault = (value) => {
  let current = value;
  for (let depth = 0; depth < 4 && current?.default; depth += 1) current = current.default;
  return current;
};
const env = unwrapDefault(envModule);
const dbModule = require('../src/config/db.js');
const db = unwrapDefault(dbModule);
const routesModule = require('../src/routes/index.js');
const routes = unwrapDefault(routesModule);
const notFoundModule = require('../src/middlewares/notFound.js');
const notFound = notFoundModule.notFound || unwrapDefault(notFoundModule)?.notFound || unwrapDefault(notFoundModule);
const errorHandlerModule = require('../src/middlewares/errorHandler.js');
const errorHandler = errorHandlerModule.errorHandler || unwrapDefault(errorHandlerModule)?.errorHandler || unwrapDefault(errorHandlerModule);
const migrateModule = require('../src/db/migrate.js');
const migrate = migrateModule.migrate || unwrapDefault(migrateModule)?.migrate;
const userRepositoryModule = require('../src/repositories/userRepository.js');
const userRepository = unwrapDefault(userRepositoryModule);
const passwordModule = require('../src/utils/password.js');
const hashPassword = passwordModule.hashPassword || unwrapDefault(passwordModule)?.hashPassword;

async function bootstrapInitialAdmin() {
  if (!process.env.VERCEL || env.NODE_ENV !== 'production') return;

  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!name && !email && !password) return;
  if (!name || !email || !password) {
    throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD together for initial admin setup.');
  }
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 12 || password.length > 128) {
    throw new Error('Initial admin setup requires a valid email and a password between 12 and 128 characters.');
  }

  await userRepository.createInitialAdmin({ name, email, passwordHash: await hashPassword(password) });
}


async function initializeApp() {
  if (!env.SESSION_SECRET && env.NODE_ENV !== 'test') throw new Error('SESSION_SECRET is required.');
  db.assertProductionConfiguration();
  await migrate();
  await bootstrapInitialAdmin();
}

function buildApp({ initializeOnRequest = false } = {}) {
  const app = express();
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  if (initializeOnRequest) {
    let initializationPromise;
    app.use((_req, _res, next) => {
      initializationPromise ||= initializeApp().catch((error) => {
        initializationPromise = undefined;
        throw error;
      });
      initializationPromise.then(() => next(), next);
    });
  }

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

async function createApp() {
  await initializeApp();
  return buildApp();
}

const app = buildApp({ initializeOnRequest: true });
app.createApp = createApp;
app.createVercelApp = () => app;

// Export the Express application itself. Vercel's Express adapter expects the
// default/CommonJS export to be the app instance, not a module of factories.
module.exports = app;

