const appModule = require('../src/app');
// Vercel's Express builder may expose a CommonJS module as its default export.
// Accept an already-created Express app as well as our local app factory so the
// service entrypoint remains compatible with both module shapes.
const candidates = [appModule];
for (let index = 0; index < candidates.length && index < 4; index += 1) {
  const defaultExport = candidates[index]?.default;
  if (defaultExport && !candidates.includes(defaultExport)) candidates.push(defaultExport);
}
const createVercelApp = candidates.find((candidate) => typeof candidate?.createVercelApp === 'function')?.createVercelApp;
const exportedApp = candidates.find((candidate) => typeof candidate === 'function'
  && typeof candidate.use === 'function' && typeof candidate.handle === 'function');

if (typeof createVercelApp === 'function') {
  module.exports = createVercelApp();
} else if (typeof exportedApp === 'function' && typeof exportedApp.use === 'function') {
  module.exports = exportedApp;
} else {
  const shape = candidates.map((candidate) => {
    if (!candidate) return String(candidate);
    const keys = Object.keys(candidate).slice(0, 12).join(',');
    return `${typeof candidate}[${keys}]`;
  }).join(' -> ');
  throw new TypeError(`The backend must export a Vercel Express application. Loaded exports: ${shape}`);
}
