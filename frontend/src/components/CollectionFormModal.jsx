import { Globe, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '../hooks/useToast';
import { api } from '../lib/api';
import { Modal } from './Modal';
import { Field, PasswordInput, Spinner } from './ui';

/** Create (collection = null) or edit a collection: name, description, home page, lock. */
export function CollectionFormModal({ open, collection, onClose, onSaved }) {
  const toast = useToast();
  const editing = Boolean(collection);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [featured, setFeatured] = useState(false);
  const [visibility, setVisibility] = useState('public');
  const [password, setPassword] = useState('');
  const [removePassword, setRemovePassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(collection?.name || '');
    setDescription(collection?.description || '');
    setFeatured(Boolean(collection?.featured));
    setVisibility(collection?.visibility || 'public');
    setPassword('');
    setRemovePassword(false);
    setError('');
  }, [open, collection]);

  const locked = visibility === 'protected';

  async function submit() {
    setError('');
    if (locked && password && password.length < 8) {
      setError('Le mot de passe de la collection doit contenir au moins 8 caractères.');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        featured,
        visibility,
        ...(locked && password && !removePassword ? { password } : {}),
        ...(locked && removePassword ? { removePassword: true } : {}),
      };
      const saved = editing ? await api.updateCollection(collection.id, body) : await api.createCollection(body);
      toast.success(editing ? 'Collection mise à jour' : `Collection « ${saved.name} » créée`);
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
      title={editing ? 'Modifier la collection' : 'Nouvelle collection'}
      description={editing ? undefined : 'Une collection regroupe plusieurs albums : « Voyages », « Famille »…'}
      onSubmit={submit}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner />} {editing ? 'Enregistrer' : 'Créer la collection'}
          </button>
        </>
      )}
    >
      <div className="form-grid">
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <Field label="Nom" htmlFor="collection-name">
          <input id="collection-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus />
        </Field>
        <Field label="Description" htmlFor="collection-description" hint="Facultative">
          <textarea id="collection-description" className="textarea" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <label className="checkbox">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
          <span>
            Afficher sur la page d’accueil
            <small>Si aucune collection n’est cochée, l’accueil montre les premières de la liste.</small>
          </span>
        </label>
        <Field label="Accès">
          <div className="segmented" role="group" aria-label="Accès à la collection">
            <button type="button" aria-pressed={!locked} onClick={() => setVisibility('public')}>
              <Globe aria-hidden="true" /> Ouverte
            </button>
            <button type="button" aria-pressed={locked} onClick={() => setVisibility('protected')}>
              <Lock aria-hidden="true" /> Verrouillée
            </button>
          </div>
          <p className="field-hint">
            {locked
              ? 'Toute la collection est fermée, sous-albums compris, même les albums publics. Elle n’apparaît plus sur l’accueil pour les visiteurs. On y entre avec le mot de passe, ou en étant autorisé.'
              : 'Chaque album garde son propre réglage, public ou protégé.'}
          </p>
        </Field>
        {locked && (
          <>
            <Field
              label="Mot de passe de la collection"
              htmlFor="collection-password"
              hint={collection?.hasPassword ? 'Laissez vide pour garder le mot de passe actuel.' : 'Facultatif · 8 caractères minimum. Sans mot de passe, elle est privée.'}
            >
              <PasswordInput
                id="collection-password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                disabled={removePassword}
                minLength={8}
              />
            </Field>
            {collection?.hasPassword && (
              <label className="checkbox">
                <input type="checkbox" checked={removePassword} onChange={(e) => setRemovePassword(e.target.checked)} />
                <span>Retirer le mot de passe<small>La collection devient privée : seuls les administrateurs et les personnes autorisées sur un album y ont accès.</small></span>
              </label>
            )}
          </>
        )}
        {editing && name.trim() && name.trim() !== collection.name && (
          <p className="field-hint">Les fichiers des photos seront déplacés vers le nouveau nom de dossier, cela peut prendre quelques secondes.</p>
        )}
      </div>
    </Modal>
  );
}
