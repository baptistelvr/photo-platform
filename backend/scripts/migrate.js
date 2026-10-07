const { migrate } = require('../src/db/migrate');
const db = require('../src/config/db');

migrate()
  .then(() => console.log('Schéma de base de données à jour.'))
  .catch((error) => {
    console.error('Échec de la migration :', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
