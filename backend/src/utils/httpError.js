class HttpError extends Error {
  constructor(status, error, message, details) {
    super(message);
    this.status = status;
    this.error = error;
    if (details) this.details = details;
  }
}

// Missing or invalid deployment configuration. Its message is safe to show
// to clients because it only names settings, never their values.
class ConfigError extends HttpError {
  constructor(message) {
    super(503, 'SERVICE_NOT_CONFIGURED', message);
  }
}

module.exports = { HttpError, ConfigError };
