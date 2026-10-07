const appModule = require('../src/app');
const createVercelApp = appModule.createVercelApp || appModule.default?.createVercelApp;

if (typeof createVercelApp !== 'function') {
  throw new TypeError('The backend must export a Vercel Express application.');
}

module.exports = createVercelApp();
