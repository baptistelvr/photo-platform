const { db } = require('../config/db');

function addAuditLog({ actorId, action, objectType, objectId, metadata, ipAddress }) {
  db.prepare(
    `INSERT INTO audit_logs (actor_id, action, object_type, object_id, metadata, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(actorId || null, action, objectType, objectId || null, metadata ? JSON.stringify(metadata) : null, ipAddress || null);
}

function listAuditLogs() {
  return db
    .prepare(
      `SELECT l.id, l.actor_id as actorId, u.email as actorEmail, l.action, l.object_type as objectType,
              l.object_id as objectId, l.metadata, l.ip_address as ipAddress, l.created_at as createdAt
       FROM audit_logs l
       LEFT JOIN users u ON u.id = l.actor_id
       ORDER BY l.created_at DESC
       LIMIT 500`
    )
    .all()
    .map((row) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));
}

module.exports = { addAuditLog, listAuditLogs };
