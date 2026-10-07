const unwrap = (value) => { let current = value; for (let depth = 0; depth < 4 && current && current.default; depth += 1) current = current.default; return current; };
const env = unwrap(require('./config/env'));
const { createApp } = unwrap(require('./app'));

createApp().then((app) => {
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://localhost:${env.PORT}`);
  });
}).catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Backend startup failed:', error);
  process.exitCode = 1;
});

