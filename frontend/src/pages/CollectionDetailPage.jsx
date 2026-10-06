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
  const [password, setPassword] = useState('');

  function loadAlbum(albumPassword = '') {
    return Promise.all([api.getAlbum(id, albumPassword), api.listAlbumPhotos(id, albumPassword)])
      .then(([albumRes, photosRes]) => {
        setAlbum(albumRes.data);
        setPhotos(photosRes.data || []);
        setError('');
      })
      .catch((err) => setError(err.payload?.message || 'Album inaccessible'));
  }

  useEffect(() => {
    loadAlbum();
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

  if (error) {
    return (
      <section>
        <p>{error}</p>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            loadAlbum(password);
          }}
        >
          <label htmlFor="album-password">Mot de passe album</label>
          <input
            id="album-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="submit">Déverrouiller</button>
        </form>
      </section>
    );
  }
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
