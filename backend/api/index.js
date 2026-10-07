// Vercel entrypoint (see vercel.json): the default export must be the Express app.
const { createApp } = require('../src/app');

module.exports = createApp();
