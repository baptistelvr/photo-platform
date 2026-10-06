const { ZodError } = require('zod');

function errorHandler(err, req, res, _next) {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: 'FILE_TOO_LARGE',
      message: 'Fichier supérieur à 1 Mo',
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Entrée invalide',
      details: err.issues,
    });
  }

  const status = err.status || 500;
  const payload = {
    success: false,
    error: err.error || 'INTERNAL_ERROR',
    message: status === 500 ? 'Erreur interne du serveur' : err.message,
  };

  return res.status(status).json(payload);
}

module.exports = { errorHandler };
