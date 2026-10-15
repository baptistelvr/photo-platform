import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { groupAlbumsByCollection } from '../lib/albums';
import { Modal } from './Modal';
import { Spinner } from './ui';

/**
 * Picks several albums at once, shown as the tree of collections and albums.
 * `lockedIds` are already chosen and cannot be unticked (the photo is already
 * there); `excludeIds` are not offered at all.
 */
export function AlbumPickerModal({
  open, title, description, albums, lockedIds = [], excludeIds = [], initialIds = [], confirmLabel = 'Valider', allowEmpty = false,
  onClose, onConfirm,
}) {
  const [selected, setSelected] = useState(new Set());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(initialIds));
    setQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const locked = useMemo(() => new Set(lockedIds), [lockedIds]);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hidden = new Set(excludeIds);
    const list = (albums || []).filter((album) => !hidden.has(album.id)
      && (!q || [album.collectionName, ...(album.ancestors || []).map((a) => a.name), album.name].join(' ').toLowerCase().includes(q)));
    return groupAlbumsByCollection(list);
  }, [albums, excludeIds, query]);

  const toggle = (id) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      wide
      title={title}
      description={description}
      onSubmit={async () => {
        setBusy(true);
        try {
          await onConfirm([...selected].filter((id) => !locked.has(id)));
        } finally {
          setBusy(false);
        }
      }}
      footer={(
        <>
          <span className="muted picker-count">{selected.size ? `${selected.size} sélectionné${selected.size > 1 ? 's' : ''}` : 'Aucun album choisi'}</span>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={busy || (!allowEmpty && ![...selected].some((id) => !locked.has(id)))}>
            {busy && <Spinner />} {confirmLabel}
          </button>
        </>
      )}
    >
      <div className="input-group picker-search">
        <Search aria-hidden="true" />
        <input className="input" type="search" placeholder="Rechercher un album" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher un album" />
      </div>
      {!albums ? <Spinner /> : !groups.length ? (
        <p className="muted">Aucun album ne correspond.</p>
      ) : (
        <div className="picker-list">
          {groups.map((group) => (
            <fieldset key={group.key} className="picker-group">
              <legend>{group.label}</legend>
              {group.albums.map((album) => (
                <label key={album.id} className="picker-item" style={{ '--depth': album.depth || 0 }}>
                  <input
                    type="checkbox"
                    checked={selected.has(album.id) || locked.has(album.id)}
                    disabled={locked.has(album.id)}
                    onChange={() => toggle(album.id)}
                  />
                  <span className="truncate">{album.name}</span>
                  {locked.has(album.id) && <span className="badge">déjà dedans</span>}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}
    </Modal>
  );
}
