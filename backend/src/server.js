const env = require('./config/env');
const { createApp, initialize } = require('./app');

initialize()
  .then(() => {
    createApp().listen(env.PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`API prête sur http://localhost:${env.PORT}`);
    });
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Échec du démarrage de l’API :', error.message);
    process.exitCode = 1;
  });
