import { KeyRound, Moon, Monitor, Sun } from 'lucide-react';
import { useState } from 'react';
import { Avatar, Field, PageHeader, PasswordInput, Spinner } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { PERMISSION_LABELS, PERMISSIONS, ROLE_LABELS } from '../lib/labels';

function ChangePasswordForm() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (next.length < 8) return setError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
    if (next !== confirmation) return setError('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    try {
      await api.changePassword(current, next);
      toast.success('Mot de passe modifié');
      setCurrent('');
      setNext('');
      setConfirmation('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  return (
    <form className="card card-body form-grid" onSubmit={submit}>
      <div>
        <h2>Mot de passe</h2>
        <p className="muted" style={{ marginTop: 4, fontSize: 14 }}>Utilisez au moins 8 caractères, idéalement une phrase facile à retenir.</p>
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <Field label="Mot de passe actuel" htmlFor="current-password">
        <PasswordInput id="current-password" value={current} onChange={setCurrent} required />
      </Field>
      <div className="form-row">
        <Field label="Nouveau mot de passe" htmlFor="new-password">
          <PasswordInput id="new-password" value={next} onChange={setNext} autoComplete="new-password" required minLength={8} />
        </Field>
        <Field label="Confirmation" htmlFor="confirm-password">
          <PasswordInput id="confirm-password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" required />
        </Field>
      </div>
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy || !current || !next}>
          {busy ? <Spinner /> : <KeyRound aria-hidden="true" />} Mettre à jour
        </button>
      </div>
    </form>
  );
}

export function AccountPage() {
  const { user } = useAuth();
  const { preference, setPreference } = useTheme();
  const permissions = user.role === 'main_admin' ? PERMISSIONS.map((p) => p.code) : user.permissions || [];

  return (
    <>
      <PageHeader title="Mon compte" />
      <div className="account-grid">
        <div className="form-grid">
          <section className="card card-body profile-card">
            <div className="profile-head">
              <Avatar name={user.name} size="lg" />
              <div style={{ minWidth: 0 }}>
                <h2 className="truncate">{user.name}</h2>
                <p className="muted truncate">{user.email}</p>
              </div>
            </div>
            <div className="form-grid" style={{ gap: 6, fontSize: 14 }}>
              <div><span className="muted">Rôle : </span>{ROLE_LABELS[user.role] || user.role}</div>
              <div><span className="muted">Dernière connexion : </span>{formatDateTime(user.lastLogin)}</div>
              <div><span className="muted">Membre depuis : </span>{formatDateTime(user.createdAt)}</div>
            </div>
            <div>
              <p className="field-label" style={{ marginBottom: 8 }}>Autorisations</p>
              {permissions.length ? (
                <div className="permission-chips">
                  {permissions.map((code) => <span key={code} className="badge">{PERMISSION_LABELS[code] || code}</span>)}
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 14 }}>Consultation des albums partagés avec vous.</p>
              )}
            </div>
          </section>
          <section className="card card-body form-grid">
            <h2>Apparence</h2>
            <div className="segmented" role="group" aria-label="Thème">
              <button type="button" aria-pressed={preference === 'system'} onClick={() => setPreference('system')}><Monitor aria-hidden="true" /> Système</button>
              <button type="button" aria-pressed={preference === 'light'} onClick={() => setPreference('light')}><Sun aria-hidden="true" /> Clair</button>
              <button type="button" aria-pressed={preference === 'dark'} onClick={() => setPreference('dark')}><Moon aria-hidden="true" /> Sombre</button>
            </div>
          </section>
        </div>
        <ChangePasswordForm />
      </div>
    </>
  );
}
