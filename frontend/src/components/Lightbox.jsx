import {
  ChevronLeft, ChevronRight, Download, FolderInput, Maximize, Minimize, Play, Star, Trash2, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { photoUrl, thumbnailUrl } from '../lib/api';
import { formatBytes, formatDate } from '../lib/format';

export function Lightbox({ photos, index, onIndexChange, onClose, coverPhotoId, actions = {} }) {
  const photo = photos[index];
  const rootRef = useRef(null);
  const closeRef = useRef(null);
  const touchStart = useRef(null);
  // Keyed by photo id so both reset automatically when navigating.
  const [zoomedId, setZoomedId] = useState(null);
  const [loadedId, setLoadedId] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const zoomed = zoomedId === photo?.id;
  const loaded = loadedId === photo?.id;
  const setZoomed = (update) => setZoomedId((current) => {
    const next = typeof update === 'function' ? update(current === photo?.id) : update;
    return next ? photo?.id : null;
  });

  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;
  const go = useCallback((delta) => {
    const next = index + delta;
    if (next >= 0 && next < photos.length) onIndexChange(next);
  }, [index, photos.length, onIndexChange]);

  // Lock page scroll, move focus inside and give it back on close.
  useEffect(() => {
    const previous = document.activeElement;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = '';
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.('dialog')) return;
      if (event.key === 'Escape') {
        if (zoomed) setZoomedId(null);
        else onClose();
      } else if (event.key === 'ArrowRight') go(1);
      else if (event.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose, zoomed]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Warm up the neighbours so navigation feels instant.
  useEffect(() => {
    [photos[index - 1], photos[index + 1]].filter(Boolean).forEach((p) => {
      const img = new Image();
      img.src = photoUrl(p.id);
    });
  }, [index, photos]);

  if (!photo) return null;

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  const isCover = coverPhotoId === photo.id;

  return createPortal(
    <div
      ref={rootRef}
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} sur ${photos.length}`}
      onTouchStart={(event) => {
        if (zoomed) return;
        touchStart.current = event.touches[0].clientX;
      }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return;
        const delta = event.changedTouches[0].clientX - touchStart.current;
        touchStart.current = null;
        if (Math.abs(delta) > 50) go(delta < 0 ? 1 : -1);
      }}
    >
      <div className="lightbox-bar">
        <div className="lightbox-title">
          <strong>{photo.originalName}</strong>
          <span>
            {index + 1} / {photos.length} · {photo.width}×{photo.height} · {formatBytes(photo.size)} · {formatDate(photo.createdAt)}
          </span>
        </div>
        <button type="button" className="icon-btn" onClick={() => setZoomed((z) => !z)} aria-label={zoomed ? 'Dézoomer' : 'Zoomer'} title={zoomed ? 'Dézoomer' : 'Zoomer'}>
          {zoomed ? <ZoomOut /> : <ZoomIn />}
        </button>
        {actions.onSlideshow && (
          <button type="button" className="icon-btn" onClick={() => actions.onSlideshow(photo)} aria-label="Diaporama à partir de cette photo" title="Diaporama">
            <Play />
          </button>
        )}
        <a className="icon-btn" href={photoUrl(photo.id, { download: true })} download aria-label="Télécharger l’original" title="Télécharger l’original">
          <Download />
        </a>
        {document.fullscreenEnabled && (
          <button type="button" className="icon-btn" onClick={toggleFullscreen} aria-label={fullscreen ? 'Quitter le plein écran' : 'Plein écran'} title="Plein écran">
            {fullscreen ? <Minimize /> : <Maximize />}
          </button>
        )}
        {actions.onSetCover && (
          <button
            type="button"
            className={`icon-btn${isCover ? ' active' : ''}`}
            onClick={() => {
              if (!isCover) actions.onSetCover(photo);
            }}
            aria-pressed={isCover}
            aria-label={isCover ? 'Couverture de l’album (première photo)' : 'Mettre en premier : devient la couverture'}
            title={isCover ? 'Couverture de l’album (première photo)' : 'Mettre en premier (couverture)'}
          >
            <Star />
          </button>
        )}
        {actions.onMove && (
          <button type="button" className="icon-btn" onClick={() => actions.onMove(photo)} aria-label="Déplacer vers un autre album" title="Déplacer">
            <FolderInput />
          </button>
        )}
        {actions.onDelete && (
          <button type="button" className="icon-btn" onClick={() => actions.onDelete(photo)} aria-label="Supprimer la photo" title="Supprimer">
            <Trash2 />
          </button>
        )}
        <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Fermer (Échap)" title="Fermer">
          <X />
        </button>
      </div>

      <div className={`lightbox-stage${zoomed ? ' zoomed' : ''}`}>
        <button type="button" className="lightbox-nav prev" onClick={() => go(-1)} disabled={!hasPrev} aria-label="Photo précédente">
          <ChevronLeft />
        </button>
        {!loaded && <img className="placeholder" src={thumbnailUrl(photo.id)} alt="" aria-hidden="true" />}
        <img
          key={photo.id}
          className="full"
          src={photoUrl(photo.id)}
          alt={photo.originalName}
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoadedId(photo.id)}
          onClick={() => setZoomed((z) => !z)}
          draggable={false}
        />
        <button type="button" className="lightbox-nav next" onClick={() => go(1)} disabled={!hasNext} aria-label="Photo suivante">
          <ChevronRight />
        </button>
      </div>
    </div>,
    document.body,
  );
}
