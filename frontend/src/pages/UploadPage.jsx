import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

export function UploadPage() {
  const [albums, setAlbums] = useState([]);
  const [albumId, setAlbumId] = useState('');
  const [files, setFiles] = useState([]);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.listAlbums().then((res) => {
      setAlbums(res.data || []);
      if (res.data?.[0]) setAlbumId(String(res.data[0].id));
    });
  }, []);

  const canUpload = useMemo(() => Boolean(albumId && files.length), [albumId, files.length]);

  async function submit(event) {
    event.preventDefault();
    if (!canUpload) return;
    try {
      setUploading(true);
      await api.uploadPhotos(albumId, files);
      setMessage('Upload terminé.');
      setFiles([]);
    } catch (error) {
      setMessage(error.payload?.message || 'Échec upload');
    } finally {
      setUploading(false);
    }
  }

  return (
    <section>
      <h1>Upload photos</h1>
      <form onSubmit={submit} className="form">
        <label htmlFor="album">Album</label>
        <select id="album" value={albumId} onChange={(event) => setAlbumId(event.target.value)}>
          {albums.map((album) => (
            <option value={album.id} key={album.id}>{album.name}</option>
          ))}
        </select>
        <label htmlFor="photos">Fichiers JPEG (max 1 Mo)</label>
        <input
          id="photos"
          type="file"
          accept=".jpg,.jpeg,image/jpeg"
          multiple
          onChange={(event) => setFiles((current) => [...current, ...Array.from(event.target.files || [])])}
        />
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            setFiles((current) => [...current, ...Array.from(event.dataTransfer.files || [])]);
          }}
          className="dropzone"
        >
          Glissez-déposez vos fichiers ici
        </div>
        <button type="submit" disabled={!canUpload || uploading}>{uploading ? 'Upload…' : 'Publier'}</button>
      </form>
      {files.length > 0 && (
        <ul>
          {files.map((file, index) => (
            <li key={file.name + file.size + index}>
              {file.name}
              <button type="button" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && <p>{message}</p>}
    </section>
  );
}
