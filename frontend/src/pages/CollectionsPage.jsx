import { ArrowDownUp, FolderPlus, House, Images, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlbumCard, AlbumGrid, CollectionCard, CollectionGrid } from '../components/AlbumCard';
import { CollectionFormModal } from '../components/CollectionFormModal';
import { ReorderBanner } from '../components/ReorderBanner';
import { SortableGrid } from '../components/SortableGrid';
import { EmptyState, ErrorState, PageHeader } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useFetch } from '../hooks/useFetch';
import { useOrderSaver } from '../hooks/useOrderSaver';
import { useToast } from '../hooks/useToast';
import { api } from '../lib/api';
import { noDrag } from '../lib/noDrag';
import { pluralize } from '../lib/format';

const matches = (query, ...values) => !query || values.join(' ').toLowerCase().includes(query);

function HomeToggle({ collection, onToggle }) {
  return (
    <button
      type="button"
      className={`home-toggle${collection.featured ? ' on' : ''}`}
      aria-pressed={collection.featured}
      aria-label={`${collection.featured ? 'Retirer de' : 'Afficher sur'} la page d’accueil : ${collection.name}`}
      title={collection.featured ? 'Affichée sur l’accueil' : 'Afficher sur l’accueil'}
      onClick={() => onToggle(collection)}
      {...noDrag}
    >
      <House aria-hidden="true" /> {collection.featured ? 'À l’accueil' : 'Accueil'}
    </button>
  );
}

export function CollectionsPage() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const collections = useFetch(() => api.listCollections(), [user?.id]);
  const albums = useFetch(() => api.listAlbums(), [user?.id]);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const canCreate = hasPermission('CREATE_ALBUMS');
  const canEdit = hasPermission('EDIT_ALBUMS');
  // In the URL, so the home page can link straight to it.
  const reordering = canEdit && searchParams.get('organiser') === '1';
  const setReordering = (on) => setSearchParams(on ? { organiser: '1' } : {}, { replace: true });

  const resync = (error) => {
    toast.error(error.message);
    collections.reload();
    albums.reload();
  };
  const [collectionStatus, saveCollectionOrder] = useOrderSaver((ids) => api.reorderCollections(ids), resync);
  const [albumStatus, saveAlbumOrder] = useOrderSaver((ids) => api.reorderAlbums(null, ids), resync);
  const orderStatus = [collectionStatus, albumStatus].find((s) => s === 'saving' || s === 'error')
    || (collectionStatus === 'saved' || albumStatus === 'saved' ? 'saved' : 'idle');

  const loading = collections.loading || albums.loading;
  const error = collections.error || albums.error;
  const q = reordering ? '' : query.trim().toLowerCase();

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
  const featuredCount = collections.data?.filter((c) => c.featured).length ?? 0;

  const moveCollections = (list) => {
    collections.setData(list);
    saveCollectionOrder(list.map((c) => c.id));
  };
  const moveLooseAlbums = (list) => {
    albums.setData((all) => [...all.filter((a) => a.collectionId), ...list]);
    saveAlbumOrder(list.map((a) => a.id));
  };
  const toggleFeatured = async (collection) => {
    const featured = !collection.featured;
    collections.setData((list) => list.map((c) => (c.id === collection.id ? { ...c, featured } : c)));
    try {
      await api.updateCollection(collection.id, { name: collection.name, description: collection.description, featured });
    } catch (err) {
      resync(err);
    }
  };

  return (
    <>
      <PageHeader
        title="Collections"
        subtitle={collections.data && albums.data
          ? `${pluralize(collections.data.length, 'collection')} · ${pluralize(albums.data.length, 'album')} · ${pluralize(totalPhotos, 'photo')}`
          : 'Les collections regroupent les albums.'}
        actions={!reordering && (
          <>
            {canEdit && (collections.data?.length || 0) > 0 && (
              <button type="button" className="btn" onClick={() => setReordering(true)}>
                <ArrowDownUp aria-hidden="true" /> Réorganiser
              </button>
            )}
            {canCreate && (
              <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                <FolderPlus aria-hidden="true" /> Nouvelle collection
              </button>
            )}
          </>
        )}
      />

      {reordering && (
        <ReorderBanner status={orderStatus} onDone={() => setReordering(false)}>
          Glissez les collections pour changer leur ordre. Le bouton <strong>Accueil</strong> choisit celles qui
          s’affichent sur la page d’accueil
          {featuredCount
            ? ` (${pluralize(featuredCount, 'collection choisie', 'collections choisies')}).`
            : ' : aucune pour l’instant, l’accueil montre donc les premières de la liste.'}
        </ReorderBanner>
      )}

      {!reordering && (collections.data?.length || 0) + (albums.data?.length || 0) > 4 && (
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
      ) : reordering ? (
        <>
          {collections.data && (
            <SortableGrid
              className="album-grid"
              items={collections.data}
              getLabel={(c) => `Collection ${c.name}`}
              onReorder={moveCollections}
              renderItem={(collection) => (
                <CollectionCard collection={collection} asStatic corner={<HomeToggle collection={collection} onToggle={toggleFeatured} />} />
              )}
            />
          )}
          {looseAlbums?.length > 1 && (
            <section className="page-section">
              <div className="section-header"><h2>Albums sans collection</h2></div>
              <SortableGrid
                className="album-grid"
                items={looseAlbums}
                getLabel={(a) => `Album ${a.name}`}
                onReorder={moveLooseAlbums}
                renderItem={(album) => <AlbumCard album={album} asStatic />}
              />
            </section>
          )}
        </>
      ) : (
        <>
          {(loading || visibleCollections?.length > 0) && (
            <CollectionGrid
              collections={visibleCollections}
              loading={loading}
              corner={canEdit ? (c) => c.featured && (
                <span className="corner-badge" title="Affichée sur la page d’accueil"><House aria-hidden="true" /> Accueil</span>
              ) : undefined}
            />
          )}
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
