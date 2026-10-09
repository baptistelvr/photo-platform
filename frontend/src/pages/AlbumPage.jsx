import {
  Calendar, Globe, ImagePlus, Images, KeyRound, Link2, Lock, LogIn, Pencil, Play, Star, Trash2, Upload,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlbumFormModal } from '../components/AlbumFormModal';
import { Lightbox } from '../components/Lightbox';
import { Modal } from '../components/Modal';
import { useSlideshow } from '../components/Slideshow';
import { EmptyState, ErrorState, PageHeader, PageLoader, PasswordInput, Spinner } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useConfirm } from '../hooks/useConfirm';
import { useToast } from '../hooks/useToast';
import { groupAlbumsByCollection } from '../lib/albums';
import { api, thumbnailUrl } from '../lib/api';
import { formatDate, pluralize } from '../lib/format';

const LOCKED_CODES = new Set(['ALBUM_PASSWORD_REQUIRED', 'INVALID_ALBUM_PASSWORD']);

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

function LockedAlbum({ code, onUnlock }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(code === 'INVALID_ALBUM_PASSWORD' ? 'Mot de passe incorrect.' : '');

  return (
    <div className="card locked-card">
      <div className="lock-icon"><KeyRound aria-hidden="true" /></div>
      <h1 style={{ fontSize: '1.35rem' }}>Album protégé</h1>
      <p className="muted">Saisissez le mot de passe communiqué par la personne qui vous a partagé cet album.</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          const result = await onUnlock(password);
          if (result) setError(result);
          setBusy(false);
        }}
      >
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <PasswordInput
          id="album-password"
          value={password}
          onChange={setPassword}
          placeholder="Mot de passe de l’album"
          aria-label="Mot de passe de l’album"
          autoFocus
          required
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !password}>
          {busy && <Spinner />} Déverrouiller
        </button>
      </form>
    </div>
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
          await api.movePhoto(photo.id, Number(target));
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
                {group.albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
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

  const load = useCallback(async (password) => {
    try {
      const nextAlbum = await api.getAlbum(id, password);
      const nextPhotos = await api.listAlbumPhotos(id);
      setAlbum(nextAlbum);
      setPhotos(nextPhotos);
      setStatus({ state: 'ready' });
      return null;
    } catch (error) {
      if (LOCKED_CODES.has(error.code)) {
        setStatus({ state: 'locked', code: error.code });
        return error.code === 'INVALID_ALBUM_PASSWORD' ? 'Mot de passe incorrect.' : null;
      }
      setStatus({ state: 'error', error });
      return error.message;
    }
  }, [id]);

  useEffect(() => {
    setStatus({ state: 'loading' });
    load();
  }, [load, user?.id]);

  const openId = Number(searchParams.get('photo'));
  const openIndex = openId ? photos.findIndex((p) => p.id === openId) : -1;
  const setOpenPhoto = useCallback((photo) => {
    setSearchParams(photo ? { photo: String(photo.id) } : {}, { replace: true });
  }, [setSearchParams]);
  const slideshow = useSlideshow({ title: album?.name || '', count: photos.length, loadPhotos: async () => photos });

  if (status.state === 'loading') return <PageLoader />;
  if (status.state === 'locked') return <LockedAlbum code={status.code} onUnlock={load} />;
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
  const removePhoto = (photo) => {
    setPhotos((list) => list.filter((p) => p.id !== photo.id));
    setAlbum((a) => ({
      ...a,
      photosCount: a.photosCount - 1,
      customCoverPhotoId: a.customCoverPhotoId === photo.id ? null : a.customCoverPhotoId,
    }));
    setOpenPhoto(null);
  };

  const lightboxActions = {
    onSetCover: canEdit ? async (photo) => {
      try {
        const updated = await api.updateAlbum(album.id, {
          name: album.name, description: album.description, visibility: album.visibility, coverPhotoId: photo.id,
        });
        setAlbum((a) => ({ ...a, ...updated }));
        toast.success('Couverture mise à jour');
      } catch (error) {
        toast.error(error.message);
      }
    } : undefined,
    onSlideshow: (photo) => {
      setOpenPhoto(null);
      slideshow.open(photo.id);
    },
    onMove: hasPermission('MOVE_PHOTOS') ? (photo) => setMoving(photo) : undefined,
    onDelete: hasPermission('DELETE_PHOTOS') ? async (photo) => {
      const ok = await confirm({
        title: 'Supprimer cette photo ?',
        message: `« ${photo.originalName} » sera définitivement supprimée.`,
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
      message: `« ${album.name} » et ses ${pluralize(album.photosCount, 'photo')} seront définitivement supprimés.`,
      confirmLabel: 'Supprimer l’album',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteAlbum(album.id);
      toast.success('Album supprimé');
      navigate(album.collectionId ? `/collections/${album.collectionId}` : '/collections');
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <>
      <PageHeader
        back={album.collectionId
          ? { to: `/collections/${album.collectionId}`, label: album.collectionName }
          : { to: '/collections', label: 'Collections' }}
        title={album.name}
        subtitle={album.description || undefined}
        actions={(
          <>
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
          <span className="badge"><Calendar aria-hidden="true" />Créé le {formatDate(album.createdAt)}</span>
        </div>
      </PageHeader>

      {!photos.length ? (
        <EmptyState
          icon={ImagePlus}
          title="Cet album est vide"
          action={hasPermission('UPLOAD_PHOTOS') && (
            <Link to={`/upload?album=${album.id}`} className="btn btn-primary"><Upload aria-hidden="true" /> Importer des photos</Link>
          )}
        >
          Les photos importées dans cet album apparaîtront ici.
        </EmptyState>
      ) : (
        <div className="gallery">
          {photos.map((photo) => (
            <GalleryItem
              key={photo.id}
              photo={photo}
              onOpen={setOpenPhoto}
              isCover={canEdit && album.customCoverPhotoId === photo.id}
            />
          ))}
        </div>
      )}

      {openIndex >= 0 && (
        <Lightbox
          photos={photos}
          index={openIndex}
          onIndexChange={(i) => setOpenPhoto(photos[i])}
          onClose={() => setOpenPhoto(null)}
          coverPhotoId={album.customCoverPhotoId}
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
      {slideshow.element}
    </>
  );
}
