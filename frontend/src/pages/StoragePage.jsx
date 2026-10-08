import { CircleCheck, Cloud, Eraser, HardDrive, RefreshCw, TriangleAlert, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, PageHeader, PageLoader, Spinner } from '../components/ui';
import { useConfirm } from '../hooks/useConfirm';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../hooks/useToast';
import { api } from '../lib/api';
import { pluralize } from '../lib/format';

export function StoragePage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: storage, loading, error, reload } = useFetch(() => api.getStorage(), []);
  const [deleteEmptyAlbums, setDeleteEmptyAlbums] = useState(true);
  const [busy, setBusy] = useState(false);

  if (loading && !storage) return <PageLoader label="Vérification du stockage…" />;
  if (error && !storage) return <ErrorState error={error} onRetry={reload} />;

  async function prune() {
    const ok = await confirm({
      title: `Retirer ${pluralize(storage.missing, 'photo introuvable', 'photos introuvables')} ?`,
      message: 'Leurs fiches seront supprimées de la base. Les fichiers n’existent déjà plus, rien d’autre n’est effacé. Vous pourrez ensuite réimporter votre dossier : seules ces photos seront renvoyées.',
      confirmLabel: 'Retirer',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await api.pruneStorage(deleteEmptyAlbums);
      toast.success(`${pluralize(result.removedPhotos, 'photo retirée', 'photos retirées')}${result.removedAlbums ? ` · ${pluralize(result.removedAlbums, 'album vide supprimé', 'albums vides supprimés')}` : ''}`);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const isS3 = storage.driver === 's3';

  return (
    <>
      <PageHeader
        title="Stockage"
        subtitle="Où sont rangées les photos, et vérification que chaque photo a bien ses fichiers."
        actions={(
          <button type="button" className="btn" onClick={reload} disabled={loading}>
            <RefreshCw className={loading ? 'spin' : undefined} aria-hidden="true" /> Vérifier à nouveau
          </button>
        )}
      />

      <div className="storage-grid">
        <section className="card card-body storage-card">
          <div className="storage-icon">{isS3 ? <Cloud aria-hidden="true" /> : <HardDrive aria-hidden="true" />}</div>
          <div>
            <h2>{isS3 ? 'Bucket S3' : 'Disque local'}</h2>
            <p className="muted">
              {isS3
                ? <>Bucket <strong>{storage.bucket}</strong> sur <strong>{storage.endpoint}</strong></>
                : 'Dossier Pictures du serveur (développement)'}
            </p>
          </div>
        </section>

        <section className="card card-body storage-card">
          <div className={`storage-icon ${storage.missing ? 'warning' : 'success'}`}>
            {storage.missing ? <TriangleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
          </div>
          <div>
            <h2>{storage.missing ? `${pluralize(storage.missing, 'photo introuvable', 'photos introuvables')}` : 'Tout est en ordre'}</h2>
            <p className="muted">
              {pluralize(storage.photos, 'photo')} en base · {pluralize(storage.files, 'fichier')} dans le stockage
            </p>
          </div>
        </section>
      </div>

      {storage.missing > 0 && (
        <section className="card card-body form-grid storage-fix">
          <div>
            <h2>Réparer après un changement de stockage</h2>
            <p className="muted" style={{ marginTop: 6 }}>
              Ces photos sont référencées dans la base mais leurs fichiers n’existent pas dans le stockage actuel,
              par exemple parce qu’elles étaient dans l’ancien Vercel Blob. Retirez-les, puis réimportez votre dossier
              depuis la page Importer : les collections et albums existants seront réutilisés et seules les photos
              manquantes seront envoyées.
            </p>
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={deleteEmptyAlbums} onChange={(e) => setDeleteEmptyAlbums(e.target.checked)} />
            <span>
              Supprimer aussi les albums et collections qui deviennent vides
              <small>Ils seront recréés par l’import. Décochez pour garder leurs réglages (visibilité, mot de passe, accès).</small>
            </span>
          </label>
          <div className="page-actions">
            <button type="button" className="btn btn-danger" onClick={prune} disabled={busy}>
              {busy ? <Spinner /> : <Eraser aria-hidden="true" />} Retirer les photos introuvables
            </button>
            <Link to="/upload" className="btn"><Upload aria-hidden="true" /> Aller à l’import</Link>
          </div>
        </section>
      )}
    </>
  );
}
