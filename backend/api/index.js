const appModule = require('../src/app');
// Vercel's Express builder may expose a CommonJS module as its default export.
// Accept an already-created Express app as well as our local app factory so the
// service entrypoint remains compatible with both module shapes.
const exportedApp = appModule.default || (typeof appModule === 'function' ? appModule : null);
const createVercelApp = appModule.createVercelApp || exportedApp?.createVercelApp;

if (typeof createVercelApp === 'function') {
  module.exports = createVercelApp();
} else if (typeof exportedApp === 'function' && typeof exportedApp.use === 'function') {
  module.exports = exportedApp;
} else {
  throw new TypeError('The backend must export a Vercel Express application.');
}
