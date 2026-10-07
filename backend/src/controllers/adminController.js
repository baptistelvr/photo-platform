const { listAuditLogs } = require('../repositories/auditRepository');

async function getLogs(_req, res) {
  res.json({ success: true, data: await listAuditLogs() });
}

module.exports = { getLogs };

