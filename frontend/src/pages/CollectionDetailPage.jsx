import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';

export function CollectionDetailPage() {
  const { id } = useParams();
  const [album, setAlbum] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(-1);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    Promise.all([api.getAlbum(id), api.listAlbumPhotos(id)])
      .then(([albumRes, photosRes]) => {
        setAlbum(albumRes.data);
        setPhotos(photosRes.data || []);
      })
      .catch((err) => setError(err.payload?.message || 'Album inaccessible'));
  }, [id]);

  useEffect(() => {
    function onKeyDown(event) {
      if (index < 0) return;
      if (event.key === 'Escape') setIndex(-1);
      if (event.key === 'ArrowRight') setIndex((current) => Math.min(current + 1, photos.length - 1));
      if (event.key === 'ArrowLeft') setIndex((current) => Math.max(current - 1, 0));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, photos.length]);

  if (error) return <p>{error}</p>;
  if (!album) return <p>Chargement…</p>;
  const current = index >= 0 ? photos[index] : null;

  return (
    <section>
      <h1>{album.name}</h1>
      <p>{album.description}</p>
      {!photos.length ? (
        <p>Aucune photo.</p>
      ) : (
        <div className="gallery" role="list">
          {photos.map((photo) => (
            <figure key={photo.id} role="listitem">
              <img
                src={api.getThumbnail(photo.id)}
                alt={photo.originalName}
                loading="lazy"
                onClick={() => {
                  setIndex(photos.findIndex((item) => item.id === photo.id));
                  setZoomed(false);
                }}
              />
              <figcaption>{photo.originalName}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {current && (
        <div className="viewer" role="dialog" aria-modal="true">
          <button type="button" onClick={() => setIndex(-1)} aria-label="Fermer">×</button>
          <button type="button" onClick={() => setIndex((i) => Math.max(i - 1, 0))} aria-label="Photo précédente">←</button>
          <img
            className={zoomed ? 'zoomed' : ''}
            src={api.getPhoto(current.id)}
            alt={current.originalName}
            onClick={() => setZoomed((value) => !value)}
          />
          <button type="button" onClick={() => setIndex((i) => Math.min(i + 1, photos.length - 1))} aria-label="Photo suivante">→</button>
          <button
            type="button"
            onClick={() => document.documentElement.requestFullscreen?.()}
            aria-label="Plein écran"
          >
            Plein écran
          </button>
        </div>
      )}
    </section>
  );
}
