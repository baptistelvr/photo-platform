const { HttpError } = require('./httpError');

function parseId(value, label = 'Ressource') {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, 'NOT_FOUND', `${label} introuvable`);
  return id;
}

module.exports = { parseId };
