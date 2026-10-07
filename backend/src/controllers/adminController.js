const unwrap = (value) => { let current = value; for (let depth = 0; depth < 4 && current && current.default; depth += 1) current = current.default; return current; };
const { listAuditLogs } = unwrap(require('../repositories/auditRepository'));

async function getLogs(_req, res) {
  res.json({ success: true, data: await listAuditLogs() });
}

module.exports = { getLogs };

