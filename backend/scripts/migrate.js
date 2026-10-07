const unwrap = (value) => value?.default ?? value;
const { migrate } = unwrap(require('../src/db/migrate'));

migrate().then(() => {
  console.log('Database schema is ready.');
}).catch((error) => {
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
});
console.log('Migrations executed successfully.');

