import { FolderPlus, Images, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlbumGrid, CollectionGrid } from '../components/AlbumCard';
import { CollectionFormModal } from '../components/CollectionFormModal';
import { EmptyState, ErrorState, PageHeader } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import { pluralize } from '../lib/format';

const matches = (query, ...values) => !query || values.join(' ').toLowerCase().includes(query);

export function CollectionsPage() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const collections = useFetch(() => api.listCollections(), [user?.id]);
  const albums = useFetch(() => api.listAlbums(), [user?.id]);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const canCreate = hasPermission('CREATE_ALBUMS');

  const loading = collections.loading || albums.loading;
  const error = collections.error || albums.error;
  const q = query.trim().toLowerCase();

  // Searching also finds a collection through the name of one of its albums.
  const visibleCollections = useMemo(() => {
    if (!collections.data) return null;
    return collections.data.filter((c) => matches(q, c.name, c.description)
      || (albums.data || []).some((a) => a.collectionId === c.id && matches(q, a.name)));
  }, [collections.data, albums.data, q]);
  const looseAlbums = useMemo(
    () => albums.data?.filter((a) => !a.collectionId && matches(q, a.name, a.description)) ?? null,
    [albums.data, q],
  );

  const totalPhotos = albums.data?.reduce((sum, a) => sum + a.photosCount, 0) ?? 0;
  const nothing = !loading && !collections.data?.length && !albums.data?.length;

  return (
    <>
      <PageHeader
        title="Collections"
        subtitle={collections.data && albums.data
          ? `${pluralize(collections.data.length, 'collection')} · ${pluralize(albums.data.length, 'album')} · ${pluralize(totalPhotos, 'photo')}`
          : 'Les collections regroupent les albums.'}
        actions={canCreate && (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <FolderPlus aria-hidden="true" /> Nouvelle collection
          </button>
        )}
      />

      {(collections.data?.length || 0) + (albums.data?.length || 0) > 4 && (
        <div className="toolbar">
          <div className="input-group">
            <Search aria-hidden="true" />
            <input
              className="input"
              type="search"
              placeholder="Rechercher une collection ou un album"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Rechercher une collection ou un album"
            />
          </div>
        </div>
      )}

      {error && !collections.data ? (
        <ErrorState error={error} onRetry={() => { collections.reload(); albums.reload(); }} />
      ) : nothing ? (
        <EmptyState
          icon={Images}
          title="Rien à afficher pour l’instant"
          action={canCreate && (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <FolderPlus aria-hidden="true" /> Créer la première collection
            </button>
          )}
        >
          {user ? 'Aucune collection ne vous est encore partagée.' : 'Les albums protégés apparaissent après connexion.'}
        </EmptyState>
      ) : (
        <>
          {(loading || visibleCollections?.length > 0) && <CollectionGrid collections={visibleCollections} loading={loading} />}
          {looseAlbums?.length > 0 && (
            <section className="page-section">
              <div className="section-header"><h2>Albums sans collection</h2></div>
              <AlbumGrid albums={looseAlbums} />
            </section>
          )}
          {q && !loading && !visibleCollections?.length && !looseAlbums?.length && (
            <EmptyState icon={Search} title="Aucun résultat">Rien ne correspond à « {query} ».</EmptyState>
          )}
        </>
      )}

      <CollectionFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(collection) => navigate(`/collections/${collection.id}`)}
      />
    </>
  );
}
