const { listAuditLogs } = require('../repositories/auditRepository');

function getLogs(_req, res) {
  res.json({ success: true, data: listAuditLogs() });
}

module.exports = { getLogs };
