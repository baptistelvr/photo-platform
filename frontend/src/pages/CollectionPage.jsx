import { FolderPlus, Images, Library, Pencil, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlbumGrid } from '../components/AlbumCard';
import { AlbumFormModal } from '../components/AlbumFormModal';
import { CollectionFormModal } from '../components/CollectionFormModal';
import { EmptyState, ErrorState, PageHeader, PageLoader } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useConfirm } from '../hooks/useConfirm';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../hooks/useToast';
import { api } from '../lib/api';
import { pluralize } from '../lib/format';

export function CollectionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: collection, loading, error, reload, setData } = useFetch(() => api.getCollection(id), [id, user?.id]);
  const [editing, setEditing] = useState(false);
  const [creatingAlbum, setCreatingAlbum] = useState(false);

  if (loading && !collection) return <PageLoader />;
  if (error && !collection) {
    if (error.status === 404) {
      return (
        <EmptyState icon={Library} title="Collection introuvable" action={<Link to="/collections" className="btn">Retour aux collections</Link>}>
          Elle n’existe pas, ou ne contient aucun album qui vous soit accessible.
        </EmptyState>
      );
    }
    return <ErrorState error={error} onRetry={reload} />;
  }

  async function remove() {
    const ok = await confirm({
      title: 'Supprimer cette collection ?',
      message: `« ${collection.name} », ses ${pluralize(collection.albumsCount, 'album')} et leurs ${pluralize(collection.photosCount, 'photo')} seront définitivement supprimés.`,
      confirmLabel: 'Tout supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteCollection(collection.id);
      toast.success('Collection supprimée');
      navigate('/collections');
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <>
      <PageHeader
        back={{ to: '/collections', label: 'Collections' }}
        title={collection.name}
        subtitle={collection.description || undefined}
        actions={(
          <>
            {hasPermission('EDIT_ALBUMS') && (
              <button type="button" className="btn" onClick={() => setEditing(true)}><Pencil aria-hidden="true" /> Modifier</button>
            )}
            {hasPermission('DELETE_ALBUMS') && (
              <button type="button" className="icon-btn danger" onClick={remove} aria-label="Supprimer la collection" title="Supprimer la collection">
                <Trash2 />
              </button>
            )}
            {hasPermission('UPLOAD_PHOTOS') && (
              <Link to="/upload" className="btn"><Upload aria-hidden="true" /> Importer</Link>
            )}
            {hasPermission('CREATE_ALBUMS') && (
              <button type="button" className="btn btn-primary" onClick={() => setCreatingAlbum(true)}>
                <FolderPlus aria-hidden="true" /> Nouvel album
              </button>
            )}
          </>
        )}
      >
        <div className="album-stats">
          <span className="badge"><Library aria-hidden="true" />{pluralize(collection.albumsCount, 'album')}</span>
          <span className="badge"><Images aria-hidden="true" />{pluralize(collection.photosCount, 'photo')}</span>
        </div>
      </PageHeader>

      {collection.albums.length ? (
        <AlbumGrid albums={collection.albums} />
      ) : (
        <EmptyState
          icon={FolderPlus}
          title="Aucun album dans cette collection"
          action={hasPermission('CREATE_ALBUMS') && (
            <button type="button" className="btn btn-primary" onClick={() => setCreatingAlbum(true)}>
              <FolderPlus aria-hidden="true" /> Créer un album
            </button>
          )}
        >
          Créez un album ici, ou importez un dossier depuis la page Importer.
        </EmptyState>
      )}

      <CollectionFormModal
        open={editing}
        collection={collection}
        onClose={() => setEditing(false)}
        onSaved={(saved) => setData((current) => ({ ...current, ...saved, albums: current.albums }))}
      />
      <AlbumFormModal
        open={creatingAlbum}
        defaultCollectionId={collection.id}
        onClose={() => setCreatingAlbum(false)}
        onSaved={(album) => navigate(`/albums/${album.id}`)}
      />
    </>
  );
}
