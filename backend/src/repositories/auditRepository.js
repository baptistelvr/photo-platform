const { query } = require('../config/db');

async function addAuditLog({ actorId, action, objectType, objectId, metadata, ipAddress }) {
  await query(`INSERT INTO audit_logs (actor_id,action,object_type,object_id,metadata,ip_address)
    VALUES ($1,$2,$3,$4,$5,$6)`, [actorId || null, action, objectType, objectId || null,
    metadata ? JSON.stringify(metadata) : null, ipAddress || null]);
}

async function listAuditLogs() {
  const { rows } = await query(`SELECT l.id,l.actor_id as "actorId",u.email as "actorEmail",l.action,
    l.object_type as "objectType",l.object_id as "objectId",l.metadata,l.ip_address as "ipAddress",
    l.created_at as "createdAt" FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_id
    ORDER BY l.created_at DESC LIMIT 500`);
  return rows.map((row) => ({ ...row, metadata: row.metadata ? JSON.parse(row.metadata) : null }));
}

module.exports = { addAuditLog, listAuditLogs };

