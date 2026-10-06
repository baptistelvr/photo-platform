import { useEffect, useState } from 'react';
import { api } from '../services/api';

export function AdminLogsPage() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api.getLogs().then((response) => setLogs(response.data || []));
  }, []);

  return (
    <section>
      <h1>Logs d'administration</h1>
      {!logs.length ? (
        <p>Aucun log.</p>
      ) : (
        <ul>
          {logs.map((log) => (
            <li key={log.id}>
              {log.createdAt} · {log.action} · {log.objectType} #{log.objectId || 'N/A'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
