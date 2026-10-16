import {
  ArrowDownAZ, ArrowDownUp, ArrowUpToLine, ArrowUpZA, Calendar, ClockArrowDown, ClockArrowUp, FlipVertical2, FolderPlus,
  FolderTree, Globe, ImagePlus, Images, Link2, Lock, LogIn, Pencil, Play, Star, Trash2, Upload,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlbumCard, AlbumGrid } from '../components/AlbumCard';
import { AlbumFormModal } from '../components/AlbumFormModal';
import { AlbumPickerModal } from '../components/AlbumPickerModal';
import { Dropdown } from '../components/Dropdown';
import { Lightbox } from '../components/Lightbox';
import { LockedCard } from '../components/LockedCard';
import { Modal } from '../components/Modal';
import { ReorderBanner } from '../components/ReorderBanner';
import { useSlideshow } from '../components/Slideshow';
import { SortableGrid } from '../components/SortableGrid';
import { EmptyState, ErrorState, PageHeader, PageLoader, Spinner } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useConfirm } from '../hooks/useConfirm';
import { useOrderSaver } from '../hooks/useOrderSaver';
import { useToast } from '../hooks/useToast';
import { albumLabel, albumOptionLabel, groupAlbumsByCollection } from '../lib/albums';
import { LOCK_CODES } from '../lib/locks';
import { api, thumbnailUrl } from '../lib/api';
import { noDrag } from '../lib/noDrag';
import { formatDate, pluralize } from '../lib/format';

const byFileName = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' }).compare;
const byImport = (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id;
const SORTS = [
  { key: 'name-asc', icon: ArrowDownAZ, label: 'Nom de fichier, de A à Z', sort: (list) => [...list].sort((a, b) => byFileName(a.originalName, b.originalName)) },
  { key: 'name-desc', icon: ArrowUpZA, label: 'Nom de fichier, de Z à A', sort: (list) => [...list].sort((a, b) => byFileName(b.originalName, a.originalName)) },
  { key: 'import-asc', icon: ClockArrowUp, label: 'Importées en premier d’abord', sort: (list) => [...list].sort(byImport) },
  { key: 'import-desc', icon: ClockArrowDown, label: 'Importées en dernier d’abord', sort: (list) => [...list].sort((a, b) => byImport(b, a)) },
  { key: 'reverse', icon: FlipVertical2, label: 'Inverser l’ordre actuel', sort: (list) => [...list].reverse() },
];

function ReorderTile({ photo, index, onFirst }) {
  return (
    <div className="reorder-tile">
      <img src={thumbnailUrl(photo.id)} alt="" loading="lazy" decoding="async" draggable={false} />
      <span className="tile-index">{index + 1}</span>
      {index === 0 ? (
        <span className="corner-badge tile-corner"><Star aria-hidden="true" /> Couverture</span>
      ) : (
        <button
          type="button"
          className="tile-first"
          onClick={() => onFirst(photo)}
          aria-label={`Mettre ${photo.originalName} en premier (couverture)`}
          title="Mettre en premier (couverture)"
          {...noDrag}
        >
          <ArrowUpToLine aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function GalleryItem({ photo, onOpen, isCover }) {
  const [loaded, setLoaded] = useState(false);
  const ratio = photo.width && photo.height ? photo.width / photo.height : 1.5;
  return (
    <button
      type="button"
      className="gallery-item"
      style={{ '--ar': Math.min(Math.max(ratio, 0.5), 3) }}
      onClick={() => onOpen(photo)}
      aria-label={`Ouvrir ${photo.originalName}`}
    >
      <i />
      <img
        src={thumbnailUrl(photo.id)}
        alt=""
        loading="lazy"
        decoding="async"
        className={loaded ? 'loaded' : undefined}
        onLoad={() => setLoaded(true)}
      />
      {isCover && <span className="cover-star" title="Couverture de l’album"><Star aria-hidden="true" /></span>}
    </button>
  );
}

function MovePhotoModal({ photo, currentAlbumId, onClose, onMoved }) {
  const toast = useToast();
  const [albums, setAlbums] = useState(null);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!photo) return;
    setTarget('');
    api.listAlbums()
      .then((list) => setAlbums(list.filter((a) => a.id !== currentAlbumId)))
      .catch((error) => toast.error(error.message));
  }, [photo, currentAlbumId, toast]);

  return (
    <Modal
      open={Boolean(photo)}
      onClose={onClose}
      busy={busy}
      title="Déplacer la photo"
      description={photo?.originalName}
      onSubmit={async () => {
        setBusy(true);
        try {
          await api.movePhoto(photo.id, Number(target), currentAlbumId);
          const album = albums.find((a) => a.id === Number(target));
          toast.success(`Photo déplacée vers « ${album?.name} »`);
          onMoved(photo);
          onClose();
        } catch (error) {
          toast.error(error.message);
        } finally {
          setBusy(false);
        }
      }}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !target}>
            {busy && <Spinner />} Déplacer
          </button>
        </>
      )}
    >
      {!albums ? <PageLoader /> : !albums.length ? (
        <p className="muted">Aucun autre album disponible.</p>
      ) : (
        <div className="field">
          <label className="field-label" htmlFor="move-target">Album de destination</label>
          <select id="move-target" className="select" value={target} onChange={(e) => setTarget(e.target.value)} required>
            <option value="" disabled>Choisir un album…</option>
            {groupAlbumsByCollection(albums).map((group) => (
              <optgroup key={group.key} label={group.label}>
                {group.albums.map((a) => <option key={a.id} value={a.id}>{albumOptionLabel(a)}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      )}
    </Modal>
  );
}

export function AlbumPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAuthenticated, hasPermission } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [album, setAlbum] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [status, setStatus] = useState({ state: 'loading' });
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(null);
  const [copying, setCopying] = useState(null);
  const [allAlbums, setAllAlbums] = useState(null);
  const [creatingSub, setCreatingSub] = useState(false);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async (password, kind) => {
    try {
      const nextAlbum = await api.getAlbum(id, password, kind);
      const nextPhotos = await api.listAlbumPhotos(id);
      setAlbum(nextAlbum);
      setPhotos(nextPhotos);
      setStatus({ state: 'ready' });
      return null;
    } catch (error) {
      // The collection's password first, if it is locked, then the album's own.
      if (LOCK_CODES[error.code]) {
        setStatus({ state: 'locked', ...LOCK_CODES[error.code] });
        return LOCK_CODES[error.code].invalid ? 'Mot de passe incorrect.' : null;
      }
      setStatus({ state: 'error', error });
      return error.message;
    }
  }, [id]);

  useEffect(() => {
    setStatus({ state: 'loading' });
    load();
  }, [load, user?.id]);

  const [orderStatus, saveOrder] = useOrderSaver(
    (ids) => api.reorderPhotos(Number(id), ids),
    (error) => {
      toast.error(error.message);
      load();
    },
  );
  const [subOrderStatus, saveSubOrder] = useOrderSaver(
    ({ collectionId, ids }) => api.reorderAlbums(collectionId, ids, Number(id)),
    (error) => {
      toast.error(error.message);
      load();
    },
  );

  // Names of the other albums a photo is in: loaded once, for the people who can file photos.
  const canFile = hasPermission('MOVE_PHOTOS');
  useEffect(() => {
    if (!canFile) return;
    api.listAlbums().then(setAllAlbums).catch(() => setAllAlbums([]));
  }, [canFile, id]);

  const openId = Number(searchParams.get('photo'));
  const openIndex = openId ? photos.findIndex((p) => p.id === openId) : -1;
  const setOpenPhoto = useCallback((photo) => {
    setSearchParams(photo ? { photo: String(photo.id) } : {}, { replace: true });
  }, [setSearchParams]);
  const slideshow = useSlideshow({ title: album?.name || '', count: photos.length, loadPhotos: async () => photos });

  if (status.state === 'loading') return <PageLoader />;
  if (status.state === 'locked') {
    return <LockedCard key={status.kind} kind={status.kind} invalid={status.invalid} onUnlock={(password) => load(password, status.kind)} />;
  }
  if (status.state === 'error') {
    const { error } = status;
    if (error.code === 'ALBUM_FORBIDDEN') {
      return (
        <EmptyState
          icon={Lock}
          title="Album réservé"
          action={!isAuthenticated && (
            <Link to="/login" state={{ from: location }} className="btn btn-primary"><LogIn aria-hidden="true" /> Se connecter</Link>
          )}
        >
          {isAuthenticated ? 'Votre compte n’a pas accès à cet album. Demandez à un administrateur de vous l’ouvrir.' : 'Connectez-vous avec un compte autorisé pour voir cet album.'}
        </EmptyState>
      );
    }
    if (error.status === 404) {
      return (
        <EmptyState icon={Images} title="Album introuvable" action={<Link to="/collections" className="btn">Retour aux collections</Link>}>
          Cet album n’existe pas ou a été supprimé.
        </EmptyState>
      );
    }
    return <ErrorState error={error} onRetry={() => { setStatus({ state: 'loading' }); load(); }} />;
  }

  const canEdit = hasPermission('EDIT_ALBUMS');
  const subAlbums = album.subAlbums || [];
  const albumName = (albumId) => allAlbums?.find((a) => a.id === albumId)?.name;
  const removePhoto = (photo) => {
    const rest = photos.filter((p) => p.id !== photo.id);
    setPhotos(rest);
    setAlbum((a) => ({ ...a, photosCount: a.photosCount - 1, coverPhotoId: rest[0]?.id ?? null }));
    setOpenPhoto(null);
  };

  // The first photo is the cover: every change of order is saved right away.
  const reorder = (list) => {
    setPhotos(list);
    setAlbum((a) => ({ ...a, coverPhotoId: list[0]?.id ?? null }));
    saveOrder(list.map((p) => p.id));
  };
  const moveToFront = (photo) => reorder([photo, ...photos.filter((p) => p.id !== photo.id)]);
  const applySort = async ({ label, sort }) => {
    const ok = await confirm({
      title: 'Trier les photos ?',
      message: `Les ${pluralize(photos.length, 'photo')} seront classées ainsi : ${label.toLowerCase()}. L’ordre actuel sera remplacé.`,
      confirmLabel: 'Trier',
    });
    if (ok) reorder(sort(photos));
  };

  const lightboxActions = {
    onSetCover: canEdit ? (photo) => {
      moveToFront(photo);
      toast.success('Photo placée en premier : c’est la couverture de l’album');
    } : undefined,
    onSlideshow: (photo) => {
      setOpenPhoto(null);
      slideshow.open(photo.id);
    },
    onMove: canFile ? (photo) => setMoving(photo) : undefined,
    onCopy: canFile ? (photo) => setCopying(photo) : undefined,
    // Only when the photo is also elsewhere: otherwise it would belong nowhere.
    onRemove: canFile ? async (photo) => {
      const others = (photo.albumIds || []).filter((albumId) => albumId !== album.id);
      if (!others.length) {
        toast.info('Cette photo n’est dans aucun autre album : utilisez Supprimer ou Déplacer.');
        return;
      }
      const ok = await confirm({
        title: 'Retirer de cet album ?',
        message: `« ${photo.originalName} » reste dans ${pluralize(others.length, 'autre album', 'autres albums')}${others.map(albumName).filter(Boolean).length ? ` (${others.map(albumName).filter(Boolean).join(', ')})` : ''}.`,
        confirmLabel: 'Retirer',
      });
      if (!ok) return;
      try {
        await api.removePhotoFromAlbum(album.id, photo.id);
        removePhoto(photo);
        toast.success('Photo retirée de cet album');
      } catch (error) {
        toast.error(error.message);
      }
    } : undefined,
    alsoIn: (photo) => (photo.albumIds || []).filter((albumId) => albumId !== album.id).map((albumId) => albumName(albumId) || 'un autre album'),
    onDelete: hasPermission('DELETE_PHOTOS') ? async (photo) => {
      const elsewhere = (photo.albumIds || []).length - 1;
      const ok = await confirm({
        title: 'Supprimer cette photo ?',
        message: elsewhere > 0
          ? `« ${photo.originalName} » sera supprimée partout, y compris dans ${pluralize(elsewhere, 'autre album', 'autres albums')}. Pour la retirer seulement d’ici, utilisez « Retirer de cet album ».`
          : `« ${photo.originalName} » sera définitivement supprimée.`,
        confirmLabel: 'Supprimer',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.deletePhoto(photo.id);
        removePhoto(photo);
        toast.success('Photo supprimée');
      } catch (error) {
        toast.error(error.message);
      }
    } : undefined,
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/albums/${album.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(album.hasPassword ? 'Lien copié — n’oubliez pas de partager le mot de passe.' : 'Lien copié');
    } catch {
      toast.info(url);
    }
  };

  const deleteAlbum = async () => {
    const ok = await confirm({
      title: 'Supprimer cet album ?',
      message: `« ${album.name} »${subAlbums.length ? `, ses ${pluralize(subAlbums.length, 'sous-album')}` : ''} et leurs photos seront supprimés. Les photos présentes aussi dans d’autres albums y sont conservées.`,
      confirmLabel: 'Supprimer l’album',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteAlbum(album.id);
      toast.success('Album supprimé');
      const parent = album.ancestors?.[album.ancestors.length - 1];
      navigate(parent ? `/albums/${parent.id}` : album.collectionId ? `/collections/${album.collectionId}` : '/collections');
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <>
      <PageHeader
        trail={[
          album.collectionId ? { to: `/collections/${album.collectionId}`, label: album.collectionName } : { to: '/collections', label: 'Collections' },
          ...(album.ancestors || []).map((a) => ({ to: `/albums/${a.id}`, label: a.name })),
        ]}
        title={album.name}
        subtitle={album.description || undefined}
        actions={!reordering && (
          <>
            {canEdit && (photos.length > 1 || subAlbums.length > 1) && (
              <button type="button" className="btn" onClick={() => setReordering(true)}><ArrowDownUp aria-hidden="true" /> Réorganiser</button>
            )}
            {photos.length > 0 && (
              <button type="button" className="btn" onClick={() => slideshow.open()}><Play aria-hidden="true" /> Diaporama</button>
            )}
            <button type="button" className="btn" onClick={copyLink}><Link2 aria-hidden="true" /> Copier le lien</button>
            {canEdit && (
              <button type="button" className="btn" onClick={() => setEditing(true)}><Pencil aria-hidden="true" /> Modifier</button>
            )}
            {hasPermission('DELETE_ALBUMS') && (
              <button type="button" className="icon-btn danger" onClick={deleteAlbum} aria-label="Supprimer l’album" title="Supprimer l’album">
                <Trash2 />
              </button>
            )}
            {hasPermission('CREATE_ALBUMS') && (
              <button type="button" className="btn" onClick={() => setCreatingSub(true)}><FolderPlus aria-hidden="true" /> Sous-album</button>
            )}
            {hasPermission('UPLOAD_PHOTOS') && (
              <Link to={`/upload?album=${album.id}`} className="btn btn-primary"><Upload aria-hidden="true" /> Importer</Link>
            )}
          </>
        )}
      >
        <div className="album-stats">
          <span className="badge">
            {album.visibility === 'protected' ? <Lock aria-hidden="true" /> : <Globe aria-hidden="true" />}
            {album.visibility === 'protected' ? (album.hasPassword ? 'Protégé par mot de passe' : 'Accès restreint') : 'Public'}
          </span>
          <span className="badge"><Images aria-hidden="true" />{pluralize(photos.length, 'photo')}</span>
          {subAlbums.length > 0 && <span className="badge"><FolderTree aria-hidden="true" />{pluralize(subAlbums.length, 'sous-album')}</span>}
          <span className="badge"><Calendar aria-hidden="true" />Créé le {formatDate(album.createdAt)}</span>
        </div>
      </PageHeader>

      {reordering ? (
        <>
          <ReorderBanner
            status={[orderStatus, subOrderStatus].includes('saving') ? 'saving' : [orderStatus, subOrderStatus].includes('error') ? 'error' : [orderStatus, subOrderStatus].includes('saved') ? 'saved' : 'idle'}
            onDone={() => setReordering(false)}
            extra={(
              <Dropdown
                label="Trier automatiquement"
                trigger={(props) => <button type="button" className="btn" {...props}><ArrowDownAZ aria-hidden="true" /> Trier</button>}
              >
                {(close) => SORTS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    onClick={() => {
                      close();
                      applySort(option);
                    }}
                  >
                    <option.icon aria-hidden="true" /> {option.label}
                  </button>
                ))}
              </Dropdown>
            )}
          >
            Glissez les sous-albums et les photos pour changer leur ordre. La première photo est la couverture de l’album.
          </ReorderBanner>
          {subAlbums.length > 1 && (
            <section className="album-section">
              <h2 className="section-title">Sous-albums</h2>
              <SortableGrid
                className="album-grid"
                items={subAlbums}
                getLabel={(a) => `Sous-album ${a.name}`}
                onReorder={(list) => {
                  setAlbum((a) => ({ ...a, subAlbums: list }));
                  saveSubOrder({ collectionId: album.collectionId, ids: list.map((a) => a.id) });
                }}
                renderItem={(sub) => <AlbumCard album={sub} asStatic />}
              />
            </section>
          )}
          {subAlbums.length > 1 && photos.length > 1 && <h2 className="section-title">Photos</h2>}
          <SortableGrid
            className="reorder-grid"
            items={photos}
            getLabel={(photo) => `Photo ${photo.originalName}`}
            onReorder={reorder}
            renderItem={(photo, index) => <ReorderTile photo={photo} index={index} onFirst={moveToFront} />}
          />
        </>
      ) : !photos.length && !subAlbums.length ? (
        <EmptyState
          icon={ImagePlus}
          title="Cet album est vide"
          action={hasPermission('UPLOAD_PHOTOS') && (
            <Link to={`/upload?album=${album.id}`} className="btn btn-primary"><Upload aria-hidden="true" /> Importer des photos</Link>
          )}
        >
          Importez des photos ici, ou créez des sous-albums pour les ranger.
        </EmptyState>
      ) : (
        <>
          {subAlbums.length > 0 && (
            <section className="album-section">
              {photos.length > 0 && <h2 className="section-title">Sous-albums</h2>}
              <AlbumGrid albums={subAlbums} />
            </section>
          )}
          {photos.length > 0 && (
            <section className="album-section">
              {subAlbums.length > 0 && <h2 className="section-title">Photos</h2>}
              <div className="gallery">
                {photos.map((photo, index) => (
                  <GalleryItem
                    key={photo.id}
                    photo={photo}
                    onOpen={setOpenPhoto}
                    isCover={canEdit && index === 0}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {openIndex >= 0 && (
        <Lightbox
          photos={photos}
          index={openIndex}
          onIndexChange={(i) => setOpenPhoto(photos[i])}
          onClose={() => setOpenPhoto(null)}
          coverPhotoId={photos[0]?.id}
          actions={lightboxActions}
        />
      )}

      <AlbumFormModal
        open={editing}
        album={album}
        onClose={() => setEditing(false)}
        onSaved={(updated) => setAlbum((a) => ({ ...a, ...updated }))}
      />
      <MovePhotoModal photo={moving} currentAlbumId={album.id} onClose={() => setMoving(null)} onMoved={removePhoto} />
      <AlbumPickerModal
        open={Boolean(copying)}
        title="Ajouter à d’autres albums"
        description={copying ? `« ${copying.originalName} » apparaîtra aussi dans les albums cochés. Le fichier n’est pas dupliqué.` : undefined}
        albums={allAlbums}
        lockedIds={copying?.albumIds || [album.id]}
        confirmLabel="Ajouter"
        onClose={() => setCopying(null)}
        onConfirm={async (albumIds) => {
          try {
            const { albumIds: now } = await api.addPhotoToAlbums(copying.id, albumIds);
            setPhotos((list) => list.map((p) => (p.id === copying.id ? { ...p, albumIds: now } : p)));
            toast.success(`Photo ajoutée à ${pluralize(albumIds.length, 'album')} : ${albumIds.map((albumId) => albumLabel(allAlbums.find((a) => a.id === albumId) || { name: '?' })).join(', ')}`);
            setCopying(null);
          } catch (error) {
            toast.error(error.message);
          }
        }}
      />
      <AlbumFormModal
        open={creatingSub}
        defaultParentId={album.id}
        onClose={() => setCreatingSub(false)}
        onSaved={(created) => navigate(`/albums/${created.id}`)}
      />
      {slideshow.element}
    </>
  );
}
