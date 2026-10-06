const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const env = require('./env');

const dbPath = path.resolve(env.DATABASE_URL);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

function transaction(callback) {
  const tx = db.transaction(callback);
  return tx();
}

module.exports = { db, transaction };
