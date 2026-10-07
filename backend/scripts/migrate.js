const unwrap = (value) => { let current = value; for (let depth = 0; depth < 4 && current && current.default; depth += 1) current = current.default; return current; };
const { migrate } = unwrap(require('../src/db/migrate'));

migrate().then(() => {
  console.log('Database schema is ready.');
}).catch((error) => {
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
});
console.log('Migrations executed successfully.');

