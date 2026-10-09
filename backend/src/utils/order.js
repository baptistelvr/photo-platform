const { HttpError } = require('./httpError');

/**
 * Final order from the ids sent by the client and the ids currently in the
 * list. Every sent id must belong to the list; ids the client did not know
 * about (added meanwhile) keep their relative place at the end.
 */
function mergeOrder(requested, current) {
  const known = new Set(current);
  if (requested.some((id) => !known.has(id))) {
    throw new HttpError(400, 'INVALID_ORDER', 'Cet ordre contient des éléments qui n’appartiennent pas à la liste');
  }
  const sent = new Set(requested);
  return [...requested, ...current.filter((id) => !sent.has(id))];
}

module.exports = { mergeOrder };
