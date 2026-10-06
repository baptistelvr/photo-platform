import { useEffect, useState } from 'react';
import { api } from '../services/api';

export function ManageAlbumsPage() {
  const [albums, setAlbums] = useState([]);
  const [name, setName] = useState('');

  async function refresh() {
    const response = await api.listAlbums();
    setAlbums(response.data || []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function createAlbum(event) {
    event.preventDefault();
    if (!name.trim()) return;
    await api.createAlbum({ name, visibility: 'public' });
    setName('');
    await refresh();
  }

  async function remove(id) {
    if (!window.confirm('Supprimer cet album ?')) return;
    await api.deleteAlbum(id);
    await refresh();
  }

  return (
    <section>
      <h1>Gestion des albums</h1>
      <form onSubmit={createAlbum} className="inline-form">
        <input aria-label="Nom album" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nouvel album" />
        <button type="submit">Créer</button>
      </form>
      <ul>
        {albums.map((album) => (
          <li key={album.id}>
            {album.name} ({album.visibility})
            <button type="button" onClick={() => remove(album.id)}>Supprimer</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
