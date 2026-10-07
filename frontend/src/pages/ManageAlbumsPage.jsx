import { ExternalLink, FolderPlus, Globe, Images, Lock, Pencil, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CoverImage } from '../components/AlbumCard';
import { AlbumFormModal } from '../components/AlbumFormModal';
import { EmptyState, ErrorState, PageHeader, PageLoader } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useConfirm } from '../hooks/useConfirm';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../hooks/useToast';
import { api } from '../lib/api';
import { formatDate, pluralize } from '../lib/format';

export function ManageAlbumsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: albums, loading, error, reload, setData } = useFetch(() => api.listAlbums(), []);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState({ open: false, album: null });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (albums || []).filter((a) => !q || a.name.toLowerCase().includes(q));
  }, [albums, query]);

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
      toast.success('Album supprimé');
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (loading && !albums) return <PageLoader />;
  if (error && !albums) return <ErrorState error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Albums"
        subtitle="Créez, renommez et réglez la visibilité de vos albums."
        actions={hasPermission('CREATE_ALBUMS') && (
          <button type="button" className="btn btn-primary" onClick={() => setModal({ open: true, album: null })}>
            <FolderPlus aria-hidden="true" /> Nouvel album
          </button>
        )}
      />

      {!albums.length ? (
        <EmptyState icon={Images} title="Aucun album">Créez un premier album pour commencer à importer des photos.</EmptyState>
      ) : (
        <>
          <div className="toolbar">
            <div className="input-group">
              <Search aria-hidden="true" />
              <input className="input" type="search" placeholder="Rechercher" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher un album" />
            </div>
            <span className="muted" style={{ fontSize: 14 }}>{pluralize(filtered.length, 'album')}</span>
          </div>
          <div className="card data-list albums-table">
            <div className="data-row head">
              <span>Album</span><span>Visibilité</span><span>Photos</span><span>Modifié</span><span />
            </div>
            {filtered.map((album) => (
              <div key={album.id} className="data-row">
                <div className="cell-main">
                  <div className={`mini-cover${album.coverPhotoId ? '' : ' empty'}`}><CoverImage photoId={album.coverPhotoId} /></div>
                  <div>
                    <Link to={`/collections/${album.id}`} className="cell-title truncate" style={{ display: 'block' }}>{album.name}</Link>
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
                  <Link to={`/collections/${album.id}`} className="icon-btn sm" aria-label={`Ouvrir ${album.name}`} title="Ouvrir"><ExternalLink /></Link>
                  {hasPermission('EDIT_ALBUMS') && (
                    <button type="button" className="icon-btn sm" onClick={() => setModal({ open: true, album })} aria-label={`Modifier ${album.name}`} title="Modifier"><Pencil /></button>
                  )}
                  {hasPermission('DELETE_ALBUMS') && (
                    <button type="button" className="icon-btn sm danger" onClick={() => remove(album)} aria-label={`Supprimer ${album.name}`} title="Supprimer"><Trash2 /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <AlbumFormModal
        open={modal.open}
        album={modal.album}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        onSaved={reload}
      />
    </>
  );
}
