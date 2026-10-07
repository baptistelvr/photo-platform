import { CircleCheck, CircleX, CloudUpload, FolderPlus, Images, LoaderCircle, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlbumFormModal } from '../components/AlbumFormModal';
import { EmptyState, PageHeader, PageLoader, Spinner } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { api } from '../lib/api';
import { formatBytes, pluralize } from '../lib/format';

const MAX_SIZE = 1024 * 1024;

function checkFile(file) {
  if (!/\.jpe?g$/i.test(file.name) || (file.type && !/^image\/p?jpe?g$/.test(file.type))) {
    return 'Format non pris en charge (JPEG uniquement)';
  }
  if (file.size > MAX_SIZE) return `Trop lourd (${formatBytes(file.size)}, 1 Mo max)`;
  return null;
}

let nextKey = 0;

export function UploadPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef(null);
  const [albums, setAlbums] = useState(null);
  const [albumId, setAlbumId] = useState(searchParams.get('album') || '');
  const [items, setItems] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    api.listAlbums()
      .then((list) => {
        setAlbums(list);
        setAlbumId((current) => (current && list.some((a) => String(a.id) === current) ? current : String(list[0]?.id || '')));
      })
      .catch((error) => {
        setAlbums([]);
        toast.error(error.message);
      });
  }, [toast]);

  // Release preview URLs when leaving the page.
  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.preview)), []);

  const addFiles = (fileList) => {
    const added = Array.from(fileList || []).map((file) => {
      const problem = checkFile(file);
      nextKey += 1;
      return {
        key: nextKey,
        file,
        preview: URL.createObjectURL(file),
        status: problem ? 'invalid' : 'ready',
        message: problem,
      };
    });
    setItems((current) => [...current, ...added]);
  };

  const removeItem = (key) => setItems((current) => current.filter((item) => {
    if (item.key === key) URL.revokeObjectURL(item.preview);
    return item.key !== key;
  }));

  const update = (key, patch) => setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const counts = useMemo(() => ({
    ready: items.filter((i) => i.status === 'ready').length,
    done: items.filter((i) => i.status === 'done').length,
    failed: items.filter((i) => i.status === 'error' || i.status === 'invalid').length,
  }), [items]);

  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const selectedAlbum = albums?.find((a) => String(a.id) === albumId);

  async function startUpload() {
    const queue = items.filter((i) => i.status === 'ready');
    if (!queue.length || !albumId) return;
    setUploading(true);
    setProgress({ done: 0, total: queue.length });
    let succeeded = 0;

    // One file per request: keeps every request far below Vercel's body limit
    // and gives per-photo feedback.
    for (const [index, item] of queue.entries()) {
      update(item.key, { status: 'uploading' });
      try {
        await api.uploadPhoto(albumId, item.file);
        update(item.key, { status: 'done', message: null });
        succeeded += 1;
      } catch (error) {
        update(item.key, { status: 'error', message: error.message });
        if (error.status === 401 || error.status === 403) break;
      }
      setProgress({ done: index + 1, total: queue.length });
    }

    setUploading(false);
    if (succeeded) toast.success(`${pluralize(succeeded, 'photo importée', 'photos importées')} dans « ${selectedAlbum?.name} »`);
    if (succeeded < queue.length) toast.error('Certaines photos n’ont pas pu être importées.');
  }

  const clearFinished = () => setItems((current) => current.filter((item) => {
    const finished = item.status === 'done';
    if (finished) URL.revokeObjectURL(item.preview);
    return !finished;
  }));

  if (!albums) return <PageLoader />;

  return (
    <>
      <PageHeader
        title="Importer des photos"
        subtitle="Formats JPEG uniquement, 1 Mo maximum par photo. L’orientation est corrigée automatiquement."
      />

      {!albums.length ? (
        <EmptyState
          icon={Images}
          title="Créez d’abord un album"
          action={hasPermission('CREATE_ALBUMS') && (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <FolderPlus aria-hidden="true" /> Nouvel album
            </button>
          )}
        >
          Les photos sont toujours rangées dans un album.
        </EmptyState>
      ) : (
        <div className="upload-layout">
          <div className="upload-target">
            <div className="field">
              <label className="field-label" htmlFor="upload-album">Album de destination</label>
              <select
                id="upload-album"
                className="select"
                value={albumId}
                disabled={uploading}
                onChange={(e) => {
                  setAlbumId(e.target.value);
                  setSearchParams({ album: e.target.value }, { replace: true });
                }}
              >
                {albums.map((album) => (
                  <option key={album.id} value={album.id}>
                    {album.name} ({pluralize(album.photosCount, 'photo')})
                  </option>
                ))}
              </select>
            </div>
            {hasPermission('CREATE_ALBUMS') && (
              <button type="button" className="btn" onClick={() => setCreating(true)} disabled={uploading}>
                <FolderPlus aria-hidden="true" /> Nouvel album
              </button>
            )}
          </div>

          <div
            className={`dropzone${dragging ? ' dragging' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            <div className="drop-icon"><CloudUpload aria-hidden="true" /></div>
            <strong>Glissez vos photos ici</strong>
            <span className="muted">ou <span className="link">parcourez vos fichiers</span></span>
            <input
              ref={inputRef}
              type="file"
              accept=".jpg,.jpeg,image/jpeg"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {items.length > 0 && (
            <>
              <div className="upload-grid">
                {items.map((item) => (
                  <div key={item.key} className="upload-item">
                    <div className="upload-thumb">
                      <img src={item.preview} alt="" />
                      {item.status === 'uploading' && <div className="upload-overlay"><LoaderCircle className="spin" aria-hidden="true" /></div>}
                      {item.status === 'done' && <div className="upload-overlay done"><CircleCheck aria-hidden="true" /></div>}
                      {(item.status === 'error' || item.status === 'invalid') && <div className="upload-overlay error"><CircleX aria-hidden="true" /></div>}
                    </div>
                    {!uploading && item.status !== 'done' && (
                      <button type="button" className="icon-btn sm remove" onClick={() => removeItem(item.key)} aria-label={`Retirer ${item.file.name}`}>
                        <X />
                      </button>
                    )}
                    <div>
                      <div className="name truncate" title={item.file.name}>{item.file.name}</div>
                      <div className={`status${item.status === 'done' ? ' done' : ''}${item.message ? ' error' : ''}`}>
                        {item.message || {
                          ready: formatBytes(item.file.size),
                          uploading: 'Envoi…',
                          done: 'Importée',
                        }[item.status]}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="upload-bar">
                <div className="summary">
                  {uploading ? (
                    <>
                      Import en cours… {progress.done} / {progress.total}
                      <div className="progress" aria-hidden="true">
                        <span style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
                      </div>
                    </>
                  ) : (
                    <>
                      <strong>{pluralize(counts.ready, 'photo prête', 'photos prêtes')}</strong>
                      {counts.done > 0 && <span className="muted"> · {pluralize(counts.done, 'importée', 'importées')}</span>}
                      {counts.failed > 0 && <span className="muted"> · {pluralize(counts.failed, 'ignorée', 'ignorées')}</span>}
                    </>
                  )}
                </div>
                {!uploading && counts.done > 0 && (
                  <>
                    <button type="button" className="btn btn-ghost" onClick={clearFinished}>Vider la liste</button>
                    <Link to={`/collections/${albumId}`} className="btn">Voir l’album</Link>
                  </>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={startUpload}
                  disabled={uploading || !counts.ready || !albumId}
                >
                  {uploading ? <Spinner /> : <CloudUpload aria-hidden="true" />}
                  {uploading ? 'Import…' : counts.ready ? `Importer ${pluralize(counts.ready, 'photo')}` : 'Importer'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <AlbumFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(album) => {
          setAlbums((list) => [album, ...(list || [])]);
          setAlbumId(String(album.id));
          setSearchParams({ album: String(album.id) }, { replace: true });
        }}
      />
    </>
  );
}
