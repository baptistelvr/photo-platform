const { query } = require('../config/db');

async function addAuditLog({ actorId, action, objectType, objectId, metadata, ipAddress }) {
  await query(`INSERT INTO audit_logs (actor_id, action, object_type, object_id, metadata, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6)`, [actorId || null, action, objectType, objectId || null,
    metadata ? JSON.stringify(metadata) : null, ipAddress || null]);
}

function parseMetadata(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

async function listAuditLogs({ limit = 500 } = {}) {
  const { rows } = await query(`SELECT l.id, l.actor_id AS "actorId", u.email AS "actorEmail", u.name AS "actorName",
    l.action, l.object_type AS "objectType", l.object_id AS "objectId", l.metadata, l.ip_address AS "ipAddress",
    l.created_at AS "createdAt" FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id
    ORDER BY l.created_at DESC, l.id DESC LIMIT $1`, [limit]);
  return rows.map((row) => ({ ...row, metadata: parseMetadata(row.metadata) }));
}

module.exports = { addAuditLog, listAuditLogs };
