import { FolderPlus, Images, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlbumGrid } from '../components/AlbumCard';
import { AlbumFormModal } from '../components/AlbumFormModal';
import { EmptyState, ErrorState, PageHeader } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import { pluralize } from '../lib/format';

export function CollectionsPage() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const { data: albums, loading, error, reload } = useFetch(() => api.listAlbums(), [user?.id]);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const canCreate = hasPermission('CREATE_ALBUMS');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return albums;
    return albums?.filter((album) => `${album.name} ${album.description}`.toLowerCase().includes(q));
  }, [albums, query]);

  const totalPhotos = albums?.reduce((sum, album) => sum + album.photosCount, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Collections"
        subtitle={albums ? `${pluralize(albums.length, 'album')} · ${pluralize(totalPhotos, 'photo')}` : 'Tous les albums auxquels vous avez accès.'}
        actions={canCreate && (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <FolderPlus aria-hidden="true" /> Nouvel album
          </button>
        )}
      />

      {albums?.length > 3 && (
        <div className="toolbar">
          <div className="input-group">
            <Search aria-hidden="true" />
            <input
              className="input"
              type="search"
              placeholder="Rechercher un album"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Rechercher un album"
            />
          </div>
        </div>
      )}

      {error && !albums ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !loading && !albums?.length ? (
        <EmptyState
          icon={Images}
          title="Aucun album disponible"
          action={canCreate && (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <FolderPlus aria-hidden="true" /> Créer le premier album
            </button>
          )}
        >
          {user ? 'Aucun album ne vous est encore partagé.' : 'Les albums protégés apparaissent après connexion.'}
        </EmptyState>
      ) : filtered && !filtered.length ? (
        <EmptyState icon={Search} title="Aucun résultat">Aucun album ne correspond à « {query} ».</EmptyState>
      ) : (
        <AlbumGrid albums={filtered} loading={loading} />
      )}

      <AlbumFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(album) => navigate(`/collections/${album.id}`)}
      />
    </>
  );
}
