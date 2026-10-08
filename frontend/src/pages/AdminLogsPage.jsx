import { RefreshCw, ScrollText, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState, ErrorState, PageHeader, PageLoader } from '../components/ui';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import { formatDateTime, pluralize } from '../lib/format';
import { ACTION_LABELS, OBJECT_LABELS } from '../lib/labels';

const PAGE_SIZE = 50;

function describe(log) {
  const meta = log.metadata || {};
  const type = OBJECT_LABELS[log.objectType] || log.objectType;
  const name = meta.name || meta.album || meta.email;
  if (log.action === 'PHOTO_UPLOAD') return `${pluralize(meta.count || 0, 'photo')} · ${name || `album #${log.objectId}`}`;
  if (log.action === 'STORAGE_PRUNE') return `${pluralize(meta.photos || 0, 'photo introuvable retirée', 'photos introuvables retirées')}${meta.albums ? ` · ${pluralize(meta.albums, 'album vide', 'albums vides')}` : ''}`;
  if (log.action === 'PHOTO_MOVE') return `Photo #${log.objectId} · album #${meta.from} → #${meta.to}`;
  return name ? `${type} · ${name}` : `${type} #${log.objectId ?? '—'}`;
}

export function AdminLogsPage() {
  const { data: logs, loading, error, reload } = useFetch(() => api.getLogs(), []);
  const [action, setAction] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const actions = useMemo(() => [...new Set((logs || []).map((l) => l.action))].sort(), [logs]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (logs || []).filter((log) => (!action || log.action === action)
      && (!q || `${log.actorEmail} ${log.actorName} ${describe(log)} ${log.ipAddress}`.toLowerCase().includes(q)));
  }, [logs, action, query]);

  if (loading && !logs) return <PageLoader />;
  if (error && !logs) return <ErrorState error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Journal d’activité"
        subtitle="Les 500 dernières actions sensibles : connexions, imports, suppressions, gestion des comptes."
        actions={(
          <button type="button" className="btn" onClick={reload} disabled={loading}>
            <RefreshCw className={loading ? 'spin' : undefined} aria-hidden="true" /> Actualiser
          </button>
        )}
      />

      {!logs.length ? (
        <EmptyState icon={ScrollText} title="Aucune activité enregistrée" />
      ) : (
        <>
          <div className="toolbar">
            <div className="input-group">
              <Search aria-hidden="true" />
              <input className="input" type="search" placeholder="Utilisateur, objet, IP…" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE_SIZE); }} aria-label="Filtrer le journal" />
            </div>
            <select className="select" style={{ width: 'auto', minWidth: 200 }} value={action} onChange={(e) => { setAction(e.target.value); setLimit(PAGE_SIZE); }} aria-label="Type d’action">
              <option value="">Toutes les actions</option>
              {actions.map((a) => <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>)}
            </select>
            <span className="muted" style={{ fontSize: 14 }}>{pluralize(filtered.length, 'entrée')}</span>
          </div>

          <div className="card data-list logs-table">
            <div className="data-row head">
              <span>Date</span><span>Action</span><span>Objet</span><span>Utilisateur</span><span>Adresse IP</span>
            </div>
            {filtered.slice(0, limit).map((log) => {
              const info = ACTION_LABELS[log.action];
              return (
                <div key={log.id} className="data-row">
                  <div className="cell-extra muted nowrap">{formatDateTime(log.createdAt)}</div>
                  <div className="cell-extra">
                    <span className="action-dot" style={{ '--dot': info?.color }} />
                    {info?.label || log.action}
                  </div>
                  <div className="cell-extra truncate soft">{describe(log)}</div>
                  <div className="cell-extra truncate">{log.actorName || log.actorEmail || <span className="muted">Compte supprimé</span>}</div>
                  <div className="cell-extra muted truncate"><span className="cell-label">IP : </span>{log.ipAddress || '—'}</div>
                </div>
              );
            })}
          </div>
          {filtered.length > limit && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
              <button type="button" className="btn" onClick={() => setLimit((l) => l + PAGE_SIZE)}>Afficher plus</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
