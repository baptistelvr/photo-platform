import { useEffect, useState } from 'react';
import { useToast } from '../hooks/useToast';
import { api } from '../lib/api';
import { Modal } from './Modal';
import { Field, Spinner } from './ui';

/** Create (collection = null) or rename/describe a collection. */
export function CollectionFormModal({ open, collection, onClose, onSaved }) {
  const toast = useToast();
  const editing = Boolean(collection);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(collection?.name || '');
    setDescription(collection?.description || '');
    setError('');
  }, [open, collection]);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const body = { name: name.trim(), description: description.trim() };
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
        {editing && name.trim() && name.trim() !== collection.name && (
          <p className="field-hint">Les fichiers des photos seront déplacés vers le nouveau nom de dossier, cela peut prendre quelques secondes.</p>
        )}
      </div>
    </Modal>
  );
}
