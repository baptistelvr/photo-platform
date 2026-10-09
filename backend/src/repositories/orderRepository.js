const { query: defaultQuery } = require('../config/db');

const TABLES = new Set(['collections', 'albums', 'photos']);

/**
 * Stores a manual order: the rows get sort_order 0, 1, 2… in the order of `ids`.
 * Positions are generated here and inlined; ids stay bound parameters.
 */
async function writeOrder(table, ids, query = defaultQuery) {
  if (!TABLES.has(table)) throw new Error(`Unknown table ${table}`);
  for (let start = 0; start < ids.length; start += 400) {
    const chunk = ids.slice(start, start + 400);
    // Each id is bound twice ($n cannot be repeated with the SQLite driver).
    const cases = chunk.map((_, i) => `WHEN $${i + 1} THEN ${start + i}`).join(' ');
    const list = chunk.map((_, i) => `$${chunk.length + i + 1}`).join(', ');
    await query(`UPDATE ${table} SET sort_order = CASE id ${cases} END WHERE id IN (${list})`, [...chunk, ...chunk]);
  }
}

module.exports = { writeOrder };
