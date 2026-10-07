const { listAuditLogs } = require('../repositories/auditRepository');

async function getLogs(_req, res, next) {
  try {
    res.json({ success: true, data: await listAuditLogs() });
  } catch (error) {
    next(error);
  }
}

module.exports = { getLogs };
