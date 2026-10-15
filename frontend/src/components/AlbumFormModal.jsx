import { Globe, Lock, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { albumOptionLabel } from '../lib/albums';
import { api } from '../lib/api';
import { Modal } from './Modal';
import { Field, PasswordInput, Spinner } from './ui';

function AccessPicker({ selected, onChange }) {
  const [users, setUsers] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.listUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users || []).filter((u) => u.role !== 'main_admin' && (!q || `${u.name} ${u.email}`.toLowerCase().includes(q)));
  }, [users, query]);

  if (!users) return <p className="field-hint">Chargement des utilisateurs…</p>;
  if (!users.length) return <p className="field-hint">Aucun utilisateur à autoriser.</p>;

  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="form-grid" style={{ gap: 8 }}>
      {users.length > 6 && (
        <div className="input-group">
          <Search aria-hidden="true" />
          <input className="input" placeholder="Filtrer les utilisateurs" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}
      <div className="check-list">
        {filtered.map((u) => (
          <label key={u.id} className="checkbox">
            <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
            <span>
              {u.name}
              <small>{u.email}</small>
            </span>
          </label>
        ))}
        {!filtered.length && <p className="field-hint">Aucun résultat.</p>}
      </div>
    </div>
  );
}

/** "c:<id>" = top level of a collection ("c:" = no collection), "a:<id>" = inside that album. */
const placeOf = (collectionId, parentId) => (parentId ? `a:${parentId}` : `c:${collectionId ?? ''}`);

/** The album itself and everything below it: it cannot be stored there. */
function selfAndBelow(albums, albumId) {
  const ids = new Set(albumId ? [albumId] : []);
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of albums) {
      if (a.parentId && ids.has(a.parentId) && !ids.has(a.id)) {
        ids.add(a.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Create (album = null) or edit an album. Calls onSaved(album) on success. */
export function AlbumFormModal({ open, album, onClose, onSaved, defaultCollectionId = null, defaultParentId = null }) {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const editing = Boolean(album);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Album lists do not include access lists: fetch them before allowing an overwrite.
  const [accessUserIds, setAccessUserIds] = useState(null);
  const [collections, setCollections] = useState(null);
  const [albums, setAlbums] = useState(null);

  useEffect(() => {
    if (!open) return;
    api.listCollections().then(setCollections).catch(() => setCollections([]));
    api.listAlbums().then(setAlbums).catch(() => setAlbums([]));
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    setError('');
    setForm({
      name: album?.name || '',
      description: album?.description || '',
      visibility: album?.visibility || 'public',
      password: '',
      removePassword: false,
      place: album ? placeOf(album.collectionId, album.parentId) : placeOf(defaultCollectionId, defaultParentId),
    });
    if (!album) {
      setAccessUserIds([]);
      return undefined;
    }
    if (album.accessUserIds) {
      setAccessUserIds(album.accessUserIds);
      return undefined;
    }
    let active = true;
    setAccessUserIds(null);
    api.getAlbum(album.id)
      .then((full) => active && setAccessUserIds(full.accessUserIds || []))
      .catch(() => active && setAccessUserIds(null));
    return () => {
      active = false;
    };
  }, [open, album, defaultCollectionId, defaultParentId]);

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const canPickUsers = hasPermission('MANAGE_USERS');

  async function submit() {
    setError('');
    if (form.visibility === 'protected' && form.password && form.password.length < 8) {
      setError('Le mot de passe de l’album doit contenir au moins 8 caractères.');
      return;
    }
    const [kind, rawId] = form.place.split(':');
    const parent = kind === 'a' ? (albums || []).find((a) => a.id === Number(rawId)) : null;
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      visibility: form.visibility,
      collectionId: parent ? parent.collectionId : (rawId ? Number(rawId) : null),
      parentId: parent ? parent.id : null,
      ...(form.visibility === 'protected' && form.password ? { password: form.password } : {}),
      ...(form.visibility === 'protected' && form.removePassword ? { removePassword: true } : {}),
      ...(canPickUsers && form.visibility === 'protected' && accessUserIds ? { accessUserIds } : {}),
    };
    setBusy(true);
    try {
      const saved = editing ? await api.updateAlbum(album.id, body) : await api.createAlbum(body);
      toast.success(editing ? 'Album mis à jour' : `Album « ${saved.name} » créé`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title={editing ? 'Modifier l’album' : 'Nouvel album'}
      description={editing ? undefined : 'Donnez-lui un nom, vous pourrez y importer des photos ensuite.'}
      onSubmit={submit}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner />}
            {editing ? 'Enregistrer' : 'Créer l’album'}
          </button>
        </>
      )}
    >
      {form && (
        <div className="form-grid">
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          <Field label="Nom" htmlFor="album-name">
            <input
              id="album-name"
              className="input"
              value={form.name}
              onChange={(e) => set('name')(e.target.value)}
              required
              maxLength={120}
              autoFocus
              placeholder="Vacances d’été, Mariage de Léa…"
            />
          </Field>
          <Field
            label="Ranger dans"
            htmlFor="album-place"
            hint={editing && album.subAlbumsCount ? 'Ses sous-albums le suivent.' : 'Une collection, ou un autre album pour en faire un sous-album.'}
          >
            <select
              id="album-place"
              className="select"
              value={form.place}
              onChange={(e) => set('place')(e.target.value)}
              disabled={!collections || !albums}
            >
              <option value="c:">Aucune collection</option>
              {(() => {
                const blocked = selfAndBelow(albums || [], album?.id);
                const inside = (collectionId) => (albums || [])
                  .filter((a) => (a.collectionId ?? null) === collectionId && !blocked.has(a.id))
                  .map((a) => <option key={a.id} value={`a:${a.id}`}>{albumOptionLabel({ ...a, depth: (a.depth || 0) + 1 })}</option>);
                return (
                  <>
                    {inside(null)}
                    {(collections || []).map((c) => (
                      <optgroup key={c.id} label={c.name}>
                        <option value={`c:${c.id}`}>{c.name} (premier niveau)</option>
                        {inside(c.id)}
                      </optgroup>
                    ))}
                  </>
                );
              })()}
            </select>
          </Field>
          <Field label="Description" htmlFor="album-description" hint="Facultative">
            <textarea
              id="album-description"
              className="textarea"
              value={form.description}
              onChange={(e) => set('description')(e.target.value)}
              maxLength={1000}
              rows={3}
            />
          </Field>
          <Field label="Visibilité">
            <div className="segmented" role="group" aria-label="Visibilité">
              <button type="button" aria-pressed={form.visibility === 'public'} onClick={() => set('visibility')('public')}>
                <Globe aria-hidden="true" /> Public
              </button>
              <button type="button" aria-pressed={form.visibility === 'protected'} onClick={() => set('visibility')('protected')}>
                <Lock aria-hidden="true" /> Protégé
              </button>
            </div>
            <p className="field-hint">
              {form.visibility === 'public'
                ? 'Visible par tous les visiteurs.'
                : 'Visible par les personnes autorisées, ou par toute personne connaissant le mot de passe.'}
            </p>
          </Field>

          {form.visibility === 'protected' && (
            <>
              <Field
                label="Mot de passe de l’album"
                htmlFor="album-password"
                hint={album?.hasPassword ? 'Laissez vide pour conserver le mot de passe actuel.' : 'Facultatif · 8 caractères minimum'}
              >
                <PasswordInput
                  id="album-password"
                  value={form.password}
                  onChange={set('password')}
                  autoComplete="new-password"
                  disabled={form.removePassword}
                  minLength={8}
                />
              </Field>
              {album?.hasPassword && (
                <label className="checkbox">
                  <input type="checkbox" checked={form.removePassword} onChange={(e) => set('removePassword')(e.target.checked)} />
                  <span>Retirer le mot de passe<small>Seuls les utilisateurs autorisés pourront ouvrir l’album.</small></span>
                </label>
              )}
              {canPickUsers && (
                <Field label="Utilisateurs autorisés">
                  {accessUserIds
                    ? <AccessPicker selected={accessUserIds} onChange={setAccessUserIds} />
                    : <p className="field-hint">Chargement des accès…</p>}
                </Field>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
