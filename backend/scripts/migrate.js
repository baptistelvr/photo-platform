const { migrate } = require('../src/db/migrate');

migrate();
console.log('Migrations executed successfully.');
