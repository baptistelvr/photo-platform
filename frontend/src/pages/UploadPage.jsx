import {
  CircleCheck, CircleX, CloudUpload, Folder, FolderOpen, FolderPlus, Globe, LoaderCircle, Lock, Square, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlbumFormModal } from '../components/AlbumFormModal';
import { PageHeader, PageLoader, Spinner } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { api, ApiError } from '../lib/api';
import {
  MAX_UPLOAD_BYTES, captureDrop, filesFromDrop, filesFromInput, groupIntoCollections, isHiddenFile, isJpegFile,
  normalizeName, runPool, shrinkToLimit,
} from '../lib/files';
import { formatBytes, pluralize } from '../lib/format';

const CONCURRENCY = 3;
const RETRYABLE = (error) => error.status === 0 || error.status === 429 || error.status >= 500;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads the photo once, shrinks it if needed and uploads it, retrying transient
 * failures (network, 429, 5xx).
 */
async function sendPhoto(albumId, file, autoResize) {
  let source;
  try {
    // In memory from here on: a clear message if the disk refuses the read (file moved,
    // cloud placeholder not downloaded), and retries no longer depend on the disk.
    source = new File([await file.arrayBuffer()], file.name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    throw new ApiError('Fichier illisible sur cet ordinateur (déplacé, ou pas encore téléchargé depuis le cloud ?)', { code: 'FILE_UNREADABLE' });
  }

  let prepared = source;
  if (autoResize) {
    try {
      prepared = await shrinkToLimit(source);
    } catch {
      throw new ApiError('Image illisible : impossible de la réduire sous 1 Mo', { code: 'RESIZE_FAILED' });
    }
  }

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await api.uploadPhoto(albumId, prepared);
    } catch (error) {
      if (attempt >= 3 || !RETRYABLE(error)) throw error;
      await wait(attempt * 2000);
    }
  }
}

let nextKey = 0;
const makeKey = () => {
  nextKey += 1;
  return nextKey;
};

function StatusIcon({ status }) {
  if (status === 'uploading') return <LoaderCircle className="spin" aria-hidden="true" />;
  if (status === 'done') return <CircleCheck aria-hidden="true" />;
  if (status === 'error') return <CircleX aria-hidden="true" />;
  return null;
}

/* ---------- Folder import: one collection per sub-folder ---------- */

function FolderBatch({ batch, setBatch, running, autoResize }) {
  const updateGroup = (key, patch) => setBatch((b) => ({
    ...b,
    groups: b.groups.map((g) => (g.key === key ? { ...g, ...patch } : g)),
  }));

  return (
    <section className="card batch">
      <header className="batch-header">
        <div className="drop-icon"><FolderOpen aria-hidden="true" /></div>
        <div>
          <h2>Import de dossier</h2>
          <p className="muted">
            {pluralize(batch.groups.length, 'collection')} · {pluralize(batch.groups.reduce((n, g) => n + g.files.length, 0), 'photo')}
            {batch.skipped > 0 && ` · ${pluralize(batch.skipped, 'fichier ignoré', 'fichiers ignorés')} (pas en JPEG)`}
            {batch.loose > 0 && ` · ${pluralize(batch.loose, 'photo hors dossier ignorée', 'photos hors dossier ignorées')}`}
          </p>
        </div>
      </header>

      <div className="data-list batch-list">
        {batch.groups.map((group) => {
          const tooBig = autoResize ? 0 : group.files.filter((f) => f.file.size > MAX_UPLOAD_BYTES).length;
          const eligible = group.files.length - tooBig;
          const done = group.files.filter((f) => f.status === 'done').length;
          const failed = group.files.filter((f) => f.status === 'error');
          const toShrink = autoResize ? group.files.filter((f) => f.file.size > MAX_UPLOAD_BYTES && !f.already).length : 0;
          const already = group.files.filter((f) => f.already).length;
          const finished = group.include && eligible > 0 && done + failed.length >= eligible && !running;
          return (
            <div key={group.key} className={`data-row${group.include ? '' : ' excluded'}`}>
              <input
                type="checkbox"
                checked={group.include}
                disabled={running}
                onChange={(e) => updateGroup(group.key, { include: e.target.checked })}
                aria-label={`Importer la collection ${group.name}`}
              />
              <div className="cell-main">
                <Folder aria-hidden="true" className="folder-icon" />
                <div>
                  <div className="cell-title truncate">{group.name}</div>
                  <div className="cell-sub">
                    {group.albumId
                      ? <span className="badge">Album existant</span>
                      : <span className="badge badge-accent">Nouvel album</span>}
                    {already > 0 && <span> · {pluralize(already, 'déjà présente', 'déjà présentes')}</span>}
                    {toShrink > 0 && done < eligible && <span> · {pluralize(toShrink, 'photo sera réduite', 'photos seront réduites')}</span>}
                    {tooBig > 0 && <span className="error-text"> · {pluralize(tooBig, 'photo trop lourde', 'photos trop lourdes')} (&gt; 1 Mo)</span>}
                    {group.error && <span className="error-text"> · {group.error}</span>}
                    {failed.length > 0 && <span className="error-text"> · {pluralize(failed.length, 'échec')} : {failed[0].message}</span>}
                  </div>
                </div>
              </div>
              <div className="cell-extra batch-progress">
                <span>{done} / {eligible}</span>
                <div className="progress"><span style={{ width: `${(done / Math.max(eligible, 1)) * 100}%` }} /></div>
              </div>
              <div className={`batch-status${finished && !failed.length ? ' done' : ''}${failed.length || group.error ? ' error' : ''}`}>
                {finished && !failed.length && !group.error ? <CircleCheck aria-hidden="true" /> : <StatusIcon status={group.status} />}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Page ---------- */

export function UploadPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('CREATE_ALBUMS');
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInput = useRef(null);
  const folderInput = useRef(null);
  const stopRequested = useRef(false);

  const [albums, setAlbums] = useState(null);
  const [albumId, setAlbumId] = useState(searchParams.get('album') || '');
  const [items, setItems] = useState([]);
  const [batch, setBatch] = useState(null);
  const [autoResize, setAutoResize] = useState(true);
  const [newVisibility, setNewVisibility] = useState('public');
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
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

  // React has no prop for this non-standard attribute.
  useEffect(() => {
    folderInput.current?.setAttribute('webkitdirectory', '');
  }, [albums]);

  // Release preview URLs when leaving the page.
  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.preview)), []);

  /* ----- Receiving files ----- */

  function addLooseFiles(files) {
    const added = files.filter((file) => !isHiddenFile(file.name)).map((file) => ({
      key: makeKey(),
      file,
      preview: URL.createObjectURL(file),
      status: isJpegFile(file) ? 'ready' : 'invalid',
      message: isJpegFile(file) ? null : 'Format non pris en charge (JPEG uniquement)',
    }));
    setItems((current) => [...current, ...added]);
  }

  async function receive(entries) {
    const hasFolders = entries.some(({ path }) => path.includes('/'));
    if (!hasFolders) {
      if (!albums.length) {
        toast.info('Créez d’abord un album, ou glissez un dossier pour créer les collections automatiquement.');
        return;
      }
      addLooseFiles(entries.map(({ file }) => file));
      return;
    }

    const { groups, loose, skipped } = groupIntoCollections(entries);
    if (!groups.length) {
      toast.error('Aucune photo JPEG trouvée dans ce dossier.');
      return;
    }
    const byName = new Map(albums.map((album) => [normalizeName(album.name), album]));

    // Photos already in an existing album (same file name) are skipped, so an
    // interrupted import can simply be started again, even after closing the tab.
    const existingNames = new Map();
    await Promise.all(groups.map(async (group) => {
      const album = byName.get(group.key);
      if (!album?.photosCount) return;
      const photos = await api.listAlbumPhotos(album.id).catch(() => []);
      existingNames.set(group.key, new Set(photos.map((p) => normalizeName(p.originalName))));
    }));

    setBatch({
      skipped,
      loose: loose.length,
      groups: groups.map((group) => {
        const present = existingNames.get(group.key);
        return {
          key: group.key,
          name: group.name,
          include: true,
          albumId: byName.get(group.key)?.id || null,
          status: 'ready',
          error: null,
          files: group.files.map((file) => {
            const already = Boolean(present?.has(normalizeName(file.name)));
            return { key: makeKey(), file, status: already ? 'done' : 'ready', already, message: null };
          }),
        };
      }),
    });
  }

  async function onDrop(event) {
    event.preventDefault();
    setDragging(false);
    if (running) return;
    const captured = captureDrop(event.dataTransfer);
    setReading(true);
    try {
      await receive(await filesFromDrop(captured));
    } catch {
      toast.error('Lecture du dossier impossible. Essayez avec « choisir un dossier ».');
    } finally {
      setReading(false);
    }
  }

  /* ----- Loose files → one album ----- */

  const blockedBySize = (item) => !autoResize && item.file.size > MAX_UPLOAD_BYTES;
  const counts = useMemo(() => {
    const blocked = (i) => !autoResize && i.file.size > MAX_UPLOAD_BYTES;
    return {
      ready: items.filter((i) => i.status === 'ready' && !blocked(i)).length,
      done: items.filter((i) => i.status === 'done').length,
      failed: items.filter((i) => i.status === 'error' || i.status === 'invalid' || (i.status === 'ready' && blocked(i))).length,
    };
  }, [items, autoResize]);

  const updateItem = (key, patch) => setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  const removeItem = (key) => setItems((current) => current.filter((item) => {
    if (item.key === key) URL.revokeObjectURL(item.preview);
    return item.key !== key;
  }));
  const clearFinished = () => setItems((current) => current.filter((item) => {
    if (item.status === 'done') URL.revokeObjectURL(item.preview);
    return item.status !== 'done';
  }));

  async function uploadLooseFiles() {
    const queue = items.filter((i) => i.status === 'ready' && !blockedBySize(i));
    if (!queue.length || !albumId) return;
    const album = albums.find((a) => String(a.id) === albumId);
    stopRequested.current = false;
    setRunning(true);
    setProgress({ done: 0, total: queue.length });
    let succeeded = 0;
    let finished = 0;

    await runPool(queue.map((item) => async () => {
      updateItem(item.key, { status: 'uploading' });
      try {
        await sendPhoto(albumId, item.file, autoResize);
        updateItem(item.key, { status: 'done', message: null });
        succeeded += 1;
      } catch (error) {
        updateItem(item.key, { status: 'error', message: error.message });
        if (error.status === 401 || error.status === 403) stopRequested.current = true;
      }
      finished += 1;
      setProgress({ done: finished, total: queue.length });
    }), CONCURRENCY, () => stopRequested.current);

    setRunning(false);
    if (succeeded) toast.success(`${pluralize(succeeded, 'photo importée', 'photos importées')} dans « ${album?.name} »`);
    if (succeeded < queue.length) toast.error('Certaines photos n’ont pas pu être importées.');
  }

  /* ----- Folder → collections ----- */

  const batchTotals = useMemo(() => {
    if (!batch) return null;
    const included = batch.groups.filter((g) => g.include);
    const eligible = included.flatMap((g) => g.files).filter((f) => autoResize || f.file.size <= MAX_UPLOAD_BYTES);
    return {
      collections: included.length,
      pending: eligible.filter((f) => f.status !== 'done').length,
      done: batch.groups.flatMap((g) => g.files).filter((f) => f.status === 'done').length,
      newAlbums: included.filter((g) => !g.albumId).length,
    };
  }, [batch, autoResize]);

  async function uploadFolder() {
    stopRequested.current = false;
    setRunning(true);
    const setGroup = (key, patch) => setBatch((b) => ({ ...b, groups: b.groups.map((g) => (g.key === key ? { ...g, ...patch } : g)) }));
    const setFile = (groupKey, fileKey, patch) => setBatch((b) => ({
      ...b,
      groups: b.groups.map((g) => (g.key !== groupKey ? g : {
        ...g,
        files: g.files.map((f) => (f.key === fileKey ? { ...f, ...patch } : f)),
      })),
    }));

    const groups = batch.groups.filter((g) => g.include);
    const targets = new Map();

    // 1. Make sure every collection has an album (created once, before any upload).
    for (const group of groups) {
      if (stopRequested.current) break;
      if (group.albumId) {
        targets.set(group.key, group.albumId);
        continue;
      }
      if (!canCreate) {
        setGroup(group.key, { error: 'album inexistant et vous ne pouvez pas en créer' });
        continue;
      }
      try {
        const album = await api.createAlbum({ name: group.name, visibility: newVisibility });
        targets.set(group.key, album.id);
        setGroup(group.key, { albumId: album.id, error: null });
        setAlbums((list) => [album, ...list]);
      } catch (error) {
        setGroup(group.key, { error: error.message });
        if (error.status === 401 || error.status === 403) stopRequested.current = true;
      }
    }

    // 2. Upload every photo, a few at a time.
    const queue = groups.filter((g) => targets.has(g.key)).flatMap((group) => group.files
      .filter((f) => f.status !== 'done' && (autoResize || f.file.size <= MAX_UPLOAD_BYTES))
      .map((f) => ({ group, f })));
    let succeeded = 0;
    let failed = 0;
    setProgress({ done: 0, total: queue.length });

    await runPool(queue.map(({ group, f }) => async () => {
      setFile(group.key, f.key, { status: 'uploading' });
      setGroup(group.key, { status: 'uploading' });
      try {
        await sendPhoto(targets.get(group.key), f.file, autoResize);
        setFile(group.key, f.key, { status: 'done', message: null });
        succeeded += 1;
      } catch (error) {
        setFile(group.key, f.key, { status: 'error', message: error.message });
        failed += 1;
        if (error.status === 401 || error.status === 403) stopRequested.current = true;
      }
      setProgress({ done: succeeded + failed, total: queue.length });
    }), CONCURRENCY, () => stopRequested.current);

    setBatch((b) => ({ ...b, groups: b.groups.map((g) => ({ ...g, status: 'ready' })) }));
    setRunning(false);

    if (succeeded + failed < queue.length) {
      toast.info('Import interrompu. Relancez-le pour envoyer les photos restantes.');
    } else if (succeeded) {
      toast.success(`${pluralize(succeeded, 'photo importée', 'photos importées')} dans ${pluralize(targets.size, 'collection')}.`);
    }
    if (failed) toast.error(`${pluralize(failed, 'photo n’a', 'photos n’ont')} pas pu être importée${failed > 1 ? 's' : ''}. Le détail est affiché par collection.`);
  }

  if (!albums) return <PageLoader />;

  const idle = !items.length && !batch;

  return (
    <>
      <PageHeader
        title="Importer des photos"
        subtitle="Glissez quelques photos pour un album, ou un dossier entier : chaque sous-dossier devient une collection."
      />

      <div className="upload-layout">
        {!batch && albums.length > 0 && (
          <div className="upload-target">
            <div className="field">
              <label className="field-label" htmlFor="upload-album">Album de destination</label>
              <select
                id="upload-album"
                className="select"
                value={albumId}
                disabled={running}
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
            {canCreate && (
              <button type="button" className="btn" onClick={() => setCreating(true)} disabled={running}>
                <FolderPlus aria-hidden="true" /> Nouvel album
              </button>
            )}
          </div>
        )}

        {!batch && (
          <div
            className={`dropzone${dragging ? ' dragging' : ''}`}
            role="button"
            tabIndex={0}
            aria-label="Ajouter des photos"
            onClick={() => fileInput.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInput.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <div className="drop-icon">{reading ? <Spinner /> : <CloudUpload aria-hidden="true" />}</div>
            <strong>{reading ? 'Lecture du dossier…' : 'Glissez vos photos ou un dossier ici'}</strong>
            <span className="muted">
              ou <span className="link">parcourez vos fichiers</span> ·{' '}
              <button
                type="button"
                className="link-button"
                onClick={(e) => {
                  e.stopPropagation();
                  folderInput.current?.click();
                }}
              >
                choisissez un dossier
              </button>
            </span>
            <input
              ref={fileInput}
              type="file"
              accept=".jpg,.jpeg,image/jpeg"
              multiple
              hidden
              onChange={async (e) => {
                const picked = filesFromInput(e.target.files);
                e.target.value = '';
                setReading(true);
                await receive(picked);
                setReading(false);
              }}
            />
            <input
              ref={folderInput}
              type="file"
              multiple
              hidden
              onChange={async (e) => {
                const picked = filesFromInput(e.target.files);
                e.target.value = '';
                setReading(true);
                await receive(picked);
                setReading(false);
              }}
            />
          </div>
        )}

        <div className="upload-options">
          <label className="checkbox">
            <input type="checkbox" checked={autoResize} disabled={running} onChange={(e) => setAutoResize(e.target.checked)} />
            <span>
              Réduire automatiquement les photos de plus de 1 Mo
              <small>Elles sont redimensionnées dans votre navigateur avant l’envoi. Vos fichiers d’origine ne sont pas modifiés.</small>
            </span>
          </label>
          {batch && batchTotals.newAlbums > 0 && (
            <div className="field">
              <span className="field-label">Visibilité des nouveaux albums</span>
              <div className="segmented" role="group" aria-label="Visibilité des nouveaux albums">
                <button type="button" aria-pressed={newVisibility === 'public'} disabled={running} onClick={() => setNewVisibility('public')}>
                  <Globe aria-hidden="true" /> Public
                </button>
                <button type="button" aria-pressed={newVisibility === 'protected'} disabled={running} onClick={() => setNewVisibility('protected')}>
                  <Lock aria-hidden="true" /> Protégé
                </button>
              </div>
            </div>
          )}
        </div>

        {batch && <FolderBatch batch={batch} setBatch={setBatch} running={running} autoResize={autoResize} />}

        {!batch && items.length > 0 && (
          <div className="upload-grid">
            {items.map((item) => {
              const tooBig = blockedBySize(item);
              const message = item.message || (tooBig ? `Trop lourd (${formatBytes(item.file.size)}, 1 Mo max)` : null);
              return (
                <div key={item.key} className="upload-item">
                  <div className="upload-thumb">
                    <img src={item.preview} alt="" />
                    {item.status === 'uploading' && <div className="upload-overlay"><LoaderCircle className="spin" aria-hidden="true" /></div>}
                    {item.status === 'done' && <div className="upload-overlay done"><CircleCheck aria-hidden="true" /></div>}
                    {(item.status === 'error' || item.status === 'invalid' || tooBig) && <div className="upload-overlay error"><CircleX aria-hidden="true" /></div>}
                  </div>
                  {!running && item.status !== 'done' && (
                    <button type="button" className="icon-btn sm remove" onClick={() => removeItem(item.key)} aria-label={`Retirer ${item.file.name}`}>
                      <X />
                    </button>
                  )}
                  <div>
                    <div className="name truncate" title={item.file.name}>{item.file.name}</div>
                    <div className={`status${item.status === 'done' ? ' done' : ''}${message ? ' error' : ''}`}>
                      {message || {
                        ready: item.file.size > MAX_UPLOAD_BYTES ? `${formatBytes(item.file.size)} · sera réduite` : formatBytes(item.file.size),
                        uploading: 'Envoi…',
                        done: 'Importée',
                      }[item.status]}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!idle && (
          <div className="upload-bar">
            <div className="summary">
              {running ? (
                <>
                  Import en cours… {progress.done} / {progress.total}
                  <div className="progress" aria-hidden="true">
                    <span style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
                  </div>
                </>
              ) : batch ? (
                <>
                  <strong>{pluralize(batchTotals.pending, 'photo à importer', 'photos à importer')}</strong>
                  <span className="muted"> · {pluralize(batchTotals.collections, 'collection')}</span>
                  {batchTotals.newAlbums > 0 && <span className="muted"> · {pluralize(batchTotals.newAlbums, 'nouvel album', 'nouveaux albums')}</span>}
                  {batchTotals.done > 0 && <span className="muted"> · {pluralize(batchTotals.done, 'déjà importée', 'déjà importées')}</span>}
                </>
              ) : (
                <>
                  <strong>{pluralize(counts.ready, 'photo prête', 'photos prêtes')}</strong>
                  {counts.done > 0 && <span className="muted"> · {pluralize(counts.done, 'importée', 'importées')}</span>}
                  {counts.failed > 0 && <span className="muted"> · {pluralize(counts.failed, 'ignorée', 'ignorées')}</span>}
                </>
              )}
            </div>

            {running ? (
              <button type="button" className="btn" onClick={() => { stopRequested.current = true; }}>
                <Square aria-hidden="true" /> Arrêter
              </button>
            ) : (
              <>
                {batch && (
                  <>
                    <button type="button" className="btn btn-ghost" onClick={() => setBatch(null)}>
                      {batchTotals.done ? 'Terminer' : 'Annuler'}
                    </button>
                    {batchTotals.done > 0 && <Link to="/collections" className="btn">Voir les collections</Link>}
                  </>
                )}
                {!batch && counts.done > 0 && (
                  <>
                    <button type="button" className="btn btn-ghost" onClick={clearFinished}>Vider la liste</button>
                    <Link to={`/collections/${albumId}`} className="btn">Voir l’album</Link>
                  </>
                )}
              </>
            )}

            {!running && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={batch ? uploadFolder : uploadLooseFiles}
                disabled={batch ? !batchTotals.pending : !counts.ready || !albumId}
              >
                <CloudUpload aria-hidden="true" />
                {batch
                  ? (batchTotals.pending ? `Importer ${pluralize(batchTotals.pending, 'photo')}` : 'Importer')
                  : (counts.ready ? `Importer ${pluralize(counts.ready, 'photo')}` : 'Importer')}
              </button>
            )}
            {running && <Spinner />}
          </div>
        )}
      </div>

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
