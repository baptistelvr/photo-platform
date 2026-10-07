const unwrap = (value) => value?.default ?? value;
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

