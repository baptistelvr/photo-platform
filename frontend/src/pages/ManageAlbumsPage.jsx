import { ExternalLink, FolderPlus, Globe, House, Images, Library, Lock, Pencil, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CoverImage } from '../components/AlbumCard';
import { AlbumFormModal } from '../components/AlbumFormModal';
import { CollectionFormModal } from '../components/CollectionFormModal';
import { EmptyState, ErrorState, PageHeader, PageLoader } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useConfirm } from '../hooks/useConfirm';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../hooks/useToast';
import { api } from '../lib/api';
import { formatDate, pluralize } from '../lib/format';

function AlbumRow({ album, canEdit, canDelete, onEdit, onDelete }) {
  return (
    <div className="data-row">
      <div className="cell-main">
        <div className={`mini-cover${album.coverPhotoId ? '' : ' empty'}`}><CoverImage photoId={album.coverPhotoId} /></div>
        <div>
          <Link to={`/albums/${album.id}`} className="cell-title truncate" style={{ display: 'block' }}>{album.name}</Link>
          <div className="cell-sub truncate">{album.description || 'Sans description'}</div>
        </div>
      </div>
      <div className="cell-extra">
        {album.visibility === 'protected' ? (
          <span className="badge badge-warning"><Lock aria-hidden="true" />{album.hasPassword ? 'Mot de passe' : 'Restreint'}</span>
        ) : (
          <span className="badge badge-success"><Globe aria-hidden="true" />Public</span>
        )}
      </div>
      <div className="cell-extra"><span className="cell-label">Photos : </span>{album.photosCount}</div>
      <div className="cell-extra muted"><span className="cell-label">Modifié : </span>{formatDate(album.updatedAt)}</div>
      <div className="row-actions">
        <Link to={`/albums/${album.id}`} className="icon-btn sm" aria-label={`Ouvrir ${album.name}`} title="Ouvrir"><ExternalLink /></Link>
        {canEdit && (
          <button type="button" className="icon-btn sm" onClick={onEdit} aria-label={`Modifier ${album.name}`} title="Modifier"><Pencil /></button>
        )}
        {canDelete && (
          <button type="button" className="icon-btn sm danger" onClick={onDelete} aria-label={`Supprimer ${album.name}`} title="Supprimer"><Trash2 /></button>
        )}
      </div>
    </div>
  );
}

export function ManageAlbumsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: albums, loading, error, reload: reloadAlbums, setData } = useFetch(() => api.listAlbums(), []);
  const collections = useFetch(() => api.listCollections(), []);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState({ open: false, album: null, collectionId: null });
  const [collectionModal, setCollectionModal] = useState({ open: false, collection: null });
  const canCreate = hasPermission('CREATE_ALBUMS');
  const canEdit = hasPermission('EDIT_ALBUMS');
  const canDelete = hasPermission('DELETE_ALBUMS');

  const reload = () => {
    reloadAlbums();
    collections.reload();
  };

  // One section per collection (empty ones included), in the order chosen by editors, albums without collection last.
  const sections = useMemo(() => {
    if (!albums) return [];
    const q = query.trim().toLowerCase();
    const hit = (...values) => !q || values.join(' ').toLowerCase().includes(q);
    const list = (collections.data || []).map((collection) => {
      const own = albums.filter((a) => a.collectionId === collection.id);
      const nameHit = hit(collection.name);
      return { collection, albums: own.filter((a) => nameHit || hit(a.name)), visible: nameHit || own.some((a) => hit(a.name)) };
    });
    const loose = albums.filter((a) => !a.collectionId && hit(a.name));
    if (loose.length) list.push({ collection: null, albums: loose, visible: true });
    return list.filter((section) => section.visible);
  }, [albums, collections.data, query]);

  async function remove(album) {
    const ok = await confirm({
      title: 'Supprimer cet album ?',
      message: `« ${album.name} » et ses ${pluralize(album.photosCount, 'photo')} seront définitivement supprimés. Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteAlbum(album.id);
      setData((list) => list.filter((a) => a.id !== album.id));
      collections.reload();
      toast.success('Album supprimé');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function removeCollection(collection) {
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
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (loading && !albums) return <PageLoader />;
  if (error && !albums) return <ErrorState error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Collections et albums"
        subtitle="Rangez vos albums dans des collections, renommez-les et réglez leur visibilité."
        actions={canCreate && (
          <>
            <button type="button" className="btn" onClick={() => setCollectionModal({ open: true, collection: null })}>
              <Library aria-hidden="true" /> Nouvelle collection
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setModal({ open: true, album: null, collectionId: null })}>
              <FolderPlus aria-hidden="true" /> Nouvel album
            </button>
          </>
        )}
      />

      {!albums.length && !collections.data?.length ? (
        <EmptyState icon={Images} title="Aucun album">Créez une collection puis un premier album, ou importez directement un dossier.</EmptyState>
      ) : (
        <>
          <div className="toolbar">
            <div className="input-group">
              <Search aria-hidden="true" />
              <input className="input" type="search" placeholder="Rechercher" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher une collection ou un album" />
            </div>
            <span className="muted" style={{ fontSize: 14 }}>
              {pluralize(collections.data?.length || 0, 'collection')} · {pluralize(albums.length, 'album')}
            </span>
          </div>

          {sections.map(({ collection, albums: list }) => (
            <section key={collection?.id ?? 'none'} className="collection-section">
              <div className="collection-heading">
                <h2>
                  <Library aria-hidden="true" />
                  {collection
                    ? <Link to={`/collections/${collection.id}`}>{collection.name}</Link>
                    : 'Sans collection'}
                  {collection?.featured && <span className="badge" title="Affichée sur la page d’accueil"><House aria-hidden="true" /> Accueil</span>}
                </h2>
                {collection && (
                  <div className="row-actions">
                    {canCreate && (
                      <button
                        type="button"
                        className="icon-btn sm"
                        onClick={() => setModal({ open: true, album: null, collectionId: collection.id })}
                        aria-label={`Nouvel album dans ${collection.name}`}
                        title="Nouvel album dans cette collection"
                      >
                        <FolderPlus />
                      </button>
                    )}
                    {canEdit && (
                      <button type="button" className="icon-btn sm" onClick={() => setCollectionModal({ open: true, collection })} aria-label={`Modifier ${collection.name}`} title="Modifier la collection"><Pencil /></button>
                    )}
                    {canDelete && (
                      <button type="button" className="icon-btn sm danger" onClick={() => removeCollection(collection)} aria-label={`Supprimer ${collection.name}`} title="Supprimer la collection"><Trash2 /></button>
                    )}
                  </div>
                )}
              </div>
              {list.length ? (
                <div className="card data-list albums-table">
                  <div className="data-row head">
                    <span>Album</span><span>Visibilité</span><span>Photos</span><span>Modifié</span><span />
                  </div>
                  {list.map((album) => (
                    <AlbumRow
                      key={album.id}
                      album={album}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      onEdit={() => setModal({ open: true, album, collectionId: null })}
                      onDelete={() => remove(album)}
                    />
                  ))}
                </div>
              ) : (
                <p className="muted">Aucun album dans cette collection.</p>
              )}
            </section>
          ))}
          {!sections.length && <EmptyState icon={Search} title="Aucun résultat">Rien ne correspond à « {query} ».</EmptyState>}
        </>
      )}

      <AlbumFormModal
        open={modal.open}
        album={modal.album}
        defaultCollectionId={modal.collectionId}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        onSaved={reload}
      />
      <CollectionFormModal
        open={collectionModal.open}
        collection={collectionModal.collection}
        onClose={() => setCollectionModal((m) => ({ ...m, open: false }))}
        onSaved={reload}
      />
    </>
  );
}
