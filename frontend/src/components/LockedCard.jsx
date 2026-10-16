import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { PasswordInput, Spinner } from './ui';

const TEXTS = {
  album: {
    title: 'Album protégé',
    help: 'Saisissez le mot de passe communiqué par la personne qui vous a partagé cet album.',
    field: 'Mot de passe de l’album',
  },
  collection: {
    title: 'Collection protégée',
    help: 'Toute cette collection est verrouillée. Saisissez le mot de passe qu’on vous a communiqué pour voir ses albums.',
    field: 'Mot de passe de la collection',
  },
};

/**
 * Password prompt for a locked album or collection. `onUnlock(password)`
 * resolves to an error message to show, or to nothing once it is open.
 */
export function LockedCard({ kind = 'album', invalid = false, onUnlock }) {
  const texts = TEXTS[kind];
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(invalid ? 'Mot de passe incorrect.' : '');

  return (
    <div className="card locked-card">
      <div className="lock-icon"><KeyRound aria-hidden="true" /></div>
      <h1 style={{ fontSize: '1.35rem' }}>{texts.title}</h1>
      <p className="muted">{texts.help}</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          const result = await onUnlock(password);
          if (result) setError(result);
          setBusy(false);
        }}
      >
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <PasswordInput
          id={`${kind}-password`}
          value={password}
          onChange={setPassword}
          placeholder={texts.field}
          aria-label={texts.field}
          autoFocus
          required
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !password}>
          {busy && <Spinner />} Déverrouiller
        </button>
      </form>
    </div>
  );
}
