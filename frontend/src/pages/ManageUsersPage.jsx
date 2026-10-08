import { Copy, Pencil, Search, ShieldCheck, Trash2, UserCheck, UserPlus, UserX, Users, WandSparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { Avatar, EmptyState, ErrorState, Field, PageHeader, PageLoader, PasswordInput, Spinner } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useConfirm } from '../hooks/useConfirm';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../hooks/useToast';
import { albumLabel } from '../lib/albums';
import { api } from '../lib/api';
import { formatRelative, generatePassword, pluralize } from '../lib/format';
import { PERMISSIONS, ROLE_LABELS } from '../lib/labels';

const PRESETS = [
  { label: 'Lecteur', codes: ['VIEW_PUBLIC_ALBUMS'] },
  { label: 'Contributeur', codes: ['VIEW_PUBLIC_ALBUMS', 'UPLOAD_PHOTOS', 'CREATE_ALBUMS'] },
  {
    label: 'Éditeur',
    codes: ['VIEW_PUBLIC_ALBUMS', 'VIEW_PROTECTED_ALBUMS', 'UPLOAD_PHOTOS', 'CREATE_ALBUMS', 'EDIT_ALBUMS', 'DELETE_ALBUMS', 'MOVE_PHOTOS', 'DELETE_PHOTOS'],
  },
];

function UserFormModal({ open, user, albums, onClose, onSaved }) {
  const { user: me, hasPermission } = useAuth();
  const toast = useToast();
  const editing = Boolean(user);
  const isSelf = editing && user.id === me.id;
  const canEditPermissions = hasPermission('MANAGE_PERMISSIONS');
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm({
      name: user?.name || '',
      email: user?.email || '',
      role: user?.role || 'user',
      status: user?.status || 'active',
      password: '',
      permissions: user?.permissions || ['VIEW_PUBLIC_ALBUMS'],
      accessibleAlbumIds: user?.accessibleAlbumIds || [],
    });
  }, [open, user]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const toggleIn = (key, value) => setForm((f) => ({
    ...f,
    [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
  }));
  const protectedAlbums = (albums || []).filter((a) => a.visibility === 'protected')
    .sort((a, b) => albumLabel(a).localeCompare(albumLabel(b), 'fr', { numeric: true }));

  async function submit() {
    setError('');
    if (!editing && form.password.length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères.');
    if (editing && form.password && form.password.length < 8) return setError('Le nouveau mot de passe doit contenir au moins 8 caractères.');

    const body = {
      name: form.name.trim(),
      email: form.email.trim(),
      ...(isSelf ? {} : { role: form.role, status: form.status }),
      ...(form.password ? { password: form.password } : {}),
      ...(canEditPermissions && form.role !== 'main_admin' ? { permissions: form.permissions } : {}),
      accessibleAlbumIds: form.accessibleAlbumIds,
    };
    setBusy(true);
    try {
      const saved = editing ? await api.updateUser(user.id, body) : await api.createUser(body);
      toast.success(editing ? 'Utilisateur mis à jour' : `Compte créé pour ${saved.name}`);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(form.password);
      toast.success('Mot de passe copié');
    } catch {
      toast.info(form.password);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      wide
      title={editing ? `Modifier ${user.name}` : 'Nouvel utilisateur'}
      onSubmit={submit}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner />} {editing ? 'Enregistrer' : 'Créer le compte'}
          </button>
        </>
      )}
    >
      {form && (
        <div className="form-grid">
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          <div className="form-row">
            <Field label="Nom" htmlFor="user-name">
              <input id="user-name" className="input" value={form.name} onChange={(e) => set('name')(e.target.value)} required maxLength={120} autoFocus />
            </Field>
            <Field label="Email" htmlFor="user-email">
              <input id="user-email" className="input" type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} required />
            </Field>
          </div>

          {!isSelf && (
            <div className="form-row">
              <Field label="Rôle" htmlFor="user-role">
                <select id="user-role" className="select" value={form.role} onChange={(e) => set('role')(e.target.value)}>
                  <option value="user">{ROLE_LABELS.user}</option>
                  <option value="admin">{ROLE_LABELS.admin}</option>
                  {(me.role === 'main_admin' || form.role === 'main_admin') && <option value="main_admin">{ROLE_LABELS.main_admin}</option>}
                </select>
              </Field>
              <Field label="Statut" htmlFor="user-status">
                <select id="user-status" className="select" value={form.status} onChange={(e) => set('status')(e.target.value)}>
                  <option value="active">Actif</option>
                  <option value="disabled">Désactivé</option>
                </select>
              </Field>
            </div>
          )}

          <Field
            label={editing ? 'Nouveau mot de passe' : 'Mot de passe'}
            htmlFor="user-password"
            hint={editing ? 'Laissez vide pour ne pas le changer.' : 'Communiquez-le à la personne ; elle pourra le modifier depuis son compte.'}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <PasswordInput id="user-password" value={form.password} onChange={set('password')} autoComplete="new-password" required={!editing} />
              </div>
              <button type="button" className="btn" onClick={() => set('password')(generatePassword())} title="Générer un mot de passe">
                <WandSparkles aria-hidden="true" /> Générer
              </button>
              {form.password && (
                <button type="button" className="icon-btn" onClick={copyPassword} aria-label="Copier le mot de passe" title="Copier"><Copy /></button>
              )}
            </div>
          </Field>

          {form.role === 'main_admin' ? (
            <div className="alert"><ShieldCheck aria-hidden="true" />L’administrateur principal dispose de toutes les autorisations.</div>
          ) : canEditPermissions && (
            <Field label="Autorisations">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                {PRESETS.map((preset) => (
                  <button key={preset.label} type="button" className="btn btn-sm" onClick={() => set('permissions')(preset.codes)}>
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="check-list columns">
                {PERMISSIONS.map((permission) => (
                  <label key={permission.code} className="checkbox">
                    <input type="checkbox" checked={form.permissions.includes(permission.code)} onChange={() => toggleIn('permissions', permission.code)} />
                    <span>{permission.label}<small>{permission.group}</small></span>
                  </label>
                ))}
              </div>
            </Field>
          )}

          {form.role !== 'main_admin' && protectedAlbums.length > 0 && (
            <Field label="Albums protégés accessibles" hint="Donne accès sans mot de passe à ces albums.">
              <div className="check-list">
                {protectedAlbums.map((album) => (
                  <label key={album.id} className="checkbox">
                    <input type="checkbox" checked={form.accessibleAlbumIds.includes(album.id)} onChange={() => toggleIn('accessibleAlbumIds', album.id)} />
                    <span>{albumLabel(album)}<small>{pluralize(album.photosCount, 'photo')}</small></span>
                  </label>
                ))}
              </div>
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}

export function ManageUsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: users, loading, error, reload, setData } = useFetch(() => api.listUsers(), []);
  const { data: albums } = useFetch(() => api.listAlbums(), []);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState({ open: false, user: null });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users || []).filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q));
  }, [users, query]);

  const canTouch = (target) => target.id !== me.id && (target.role !== 'main_admin' || me.role === 'main_admin');

  const replaceUser = (saved) => setData((list) => {
    const exists = list.some((u) => u.id === saved.id);
    return exists ? list.map((u) => (u.id === saved.id ? saved : u)) : [saved, ...list];
  });

  async function toggleStatus(target) {
    const disabling = target.status === 'active';
    if (disabling) {
      const ok = await confirm({
        title: `Désactiver ${target.name} ?`,
        message: 'La personne ne pourra plus se connecter. Vous pourrez réactiver le compte à tout moment.',
        confirmLabel: 'Désactiver',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      replaceUser(await api.updateUser(target.id, { status: disabling ? 'disabled' : 'active' }));
      toast.success(disabling ? 'Compte désactivé' : 'Compte réactivé');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function remove(target) {
    const ok = await confirm({
      title: `Supprimer ${target.name} ?`,
      message: 'Le compte sera supprimé définitivement. Ses photos restent dans leurs albums.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteUser(target.id);
      setData((list) => list.filter((u) => u.id !== target.id));
      toast.success('Utilisateur supprimé');
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (loading && !users) return <PageLoader />;
  if (error && !users) return <ErrorState error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        subtitle="Invitez des personnes et choisissez précisément ce qu’elles peuvent faire."
        actions={(
          <button type="button" className="btn btn-primary" onClick={() => setModal({ open: true, user: null })}>
            <UserPlus aria-hidden="true" /> Nouvel utilisateur
          </button>
        )}
      />

      {!users.length ? (
        <EmptyState icon={Users} title="Aucun utilisateur" />
      ) : (
        <>
          <div className="toolbar">
            <div className="input-group">
              <Search aria-hidden="true" />
              <input className="input" type="search" placeholder="Rechercher par nom ou email" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher un utilisateur" />
            </div>
            <span className="muted" style={{ fontSize: 14 }}>{pluralize(filtered.length, 'utilisateur')}</span>
          </div>
          <div className="card data-list users-table">
            <div className="data-row head">
              <span>Utilisateur</span><span>Rôle</span><span>Statut</span><span>Dernière connexion</span><span />
            </div>
            {filtered.map((u) => (
              <div key={u.id} className="data-row">
                <div className="cell-main">
                  <Avatar name={u.name} />
                  <div>
                    <div className="cell-title truncate">{u.name}{u.id === me.id && <span className="muted" style={{ fontWeight: 400 }}> (vous)</span>}</div>
                    <div className="cell-sub truncate">{u.email}</div>
                  </div>
                </div>
                <div className="cell-extra">
                  <span className={`badge${u.role === 'main_admin' ? ' badge-accent' : ''}`}>{ROLE_LABELS[u.role] || u.role}</span>
                </div>
                <div className="cell-extra">
                  {u.status === 'active'
                    ? <span className="badge badge-success">Actif</span>
                    : <span className="badge badge-danger">Désactivé</span>}
                </div>
                <div className="cell-extra muted"><span className="cell-label">Connexion : </span>{formatRelative(u.lastLogin)}</div>
                <div className="row-actions">
                  {(u.id === me.id || canTouch(u)) && (
                    <button type="button" className="icon-btn sm" onClick={() => setModal({ open: true, user: u })} aria-label={`Modifier ${u.name}`} title="Modifier"><Pencil /></button>
                  )}
                  {canTouch(u) && (
                    <>
                      <button type="button" className="icon-btn sm" onClick={() => toggleStatus(u)} aria-label={u.status === 'active' ? `Désactiver ${u.name}` : `Réactiver ${u.name}`} title={u.status === 'active' ? 'Désactiver' : 'Réactiver'}>
                        {u.status === 'active' ? <UserX /> : <UserCheck />}
                      </button>
                      <button type="button" className="icon-btn sm danger" onClick={() => remove(u)} aria-label={`Supprimer ${u.name}`} title="Supprimer"><Trash2 /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <UserFormModal
        open={modal.open}
        user={modal.user}
        albums={albums}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        onSaved={replaceUser}
      />
    </>
  );
}
