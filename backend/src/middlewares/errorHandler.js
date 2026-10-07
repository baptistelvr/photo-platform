const { ZodError } = require('zod');
const multer = require('multer');
const env = require('../config/env');
const { HttpError } = require('../utils/httpError');

const multerMessages = {
  LIMIT_FILE_SIZE: [413, 'FILE_TOO_LARGE', 'Fichier supérieur à 1 Mo'],
  LIMIT_FILE_COUNT: [400, 'TOO_MANY_FILES', `Maximum ${env.MAX_FILES_PER_UPLOAD} fichiers par envoi`],
  LIMIT_UNEXPECTED_FILE: [400, 'UNEXPECTED_FILE', 'Champ de fichier inattendu'],
};

function errorHandler(err, req, res, _next) {
  if (err instanceof multer.MulterError) {
    const [status, error, message] = multerMessages[err.code] || [400, 'UPLOAD_ERROR', 'Envoi de fichier invalide'];
    return res.status(status).json({ success: false, error, message });
  }

  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: first ? `Entrée invalide (${first.path.join('.') || 'requête'}) : ${first.message}` : 'Entrée invalide',
      details: err.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    });
  }

  // Malformed JSON body from express.json()
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'INVALID_JSON', message: 'Corps de requête JSON invalide' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'PAYLOAD_TOO_LARGE', message: 'Requête trop volumineuse' });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      success: false,
      error: err.error,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // eslint-disable-next-line no-console
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' });
}

module.exports = { errorHandler };
