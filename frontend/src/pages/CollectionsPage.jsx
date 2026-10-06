import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

export function CollectionsPage() {
  const [albums, setAlbums] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    api.listAlbums()
      .then((response) => {
        setAlbums(response.data || []);
        setStatus('done');
      })
      .catch(() => setStatus('error'));
  }, []);

  if (status === 'loading') return <p>Chargement…</p>;
  if (status === 'error') return <p>Erreur de chargement des collections.</p>;
  if (!albums.length) return <p>Aucun album disponible.</p>;

  return (
    <section>
      <h1>Collections</h1>
      <div className="grid">
        {albums.map((album) => (
          <article key={album.id} className="card">
            <h2>{album.name}</h2>
            <p>{album.description || 'Sans description'}</p>
            <p>{album.visibility === 'protected' ? 'Protégé' : 'Public'} · {album.photosCount} photos</p>
            <Link to={`/collections/${album.id}`}>Ouvrir</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
