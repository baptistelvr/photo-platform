function notFound(_req, res) {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: 'Ressource introuvable',
  });
}

module.exports = { notFound };
