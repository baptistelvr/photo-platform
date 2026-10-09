import { ImageOff, Library, Lock } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { thumbnailUrl } from '../lib/api';
import { pluralize } from '../lib/format';

export function CoverImage({ photoId, alt = '', className }) {
  const [failed, setFailed] = useState(false);
  if (!photoId || failed) {
    return (
      <div className="cover-empty">
        <ImageOff aria-hidden="true" />
      </div>
    );
  }
  return (
    <img
      className={className}
      src={thumbnailUrl(photoId)}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/** A link, or a plain block while the cards are being reordered. */
function CardRoot({ to, className, asStatic, children }) {
  if (asStatic) return <div className={className}>{children}</div>;
  return <Link to={to} className={className}>{children}</Link>;
}

/** `corner` goes in the top right corner of the cover (badge or button). */
export function AlbumCard({ album, asStatic = false, corner = null }) {
  return (
    <CardRoot to={`/albums/${album.id}`} className="album-card" asStatic={asStatic}>
      <div className="album-cover">
        <CoverImage photoId={album.coverPhotoId} />
        {album.visibility === 'protected' && (
          <span className="cover-badge">
            <Lock aria-hidden="true" /> Protégé
          </span>
        )}
        {corner && <div className="cover-corner">{corner}</div>}
      </div>
      <div className="album-meta">
        <h3 title={album.name}>{album.name}</h3>
        <p>{pluralize(album.photosCount, 'photo')}</p>
      </div>
    </CardRoot>
  );
}

/** A collection shown as a small stack of prints, to tell it apart from an album. */
export function CollectionCard({ collection, asStatic = false, corner = null }) {
  return (
    <CardRoot to={`/collections/${collection.id}`} className="album-card collection-card" asStatic={asStatic}>
      <div className="album-cover">
        <CoverImage photoId={collection.coverPhotoId} />
        <span className="cover-badge">
          <Library aria-hidden="true" /> {pluralize(collection.albumsCount, 'album')}
        </span>
        {corner && <div className="cover-corner">{corner}</div>}
      </div>
      <div className="album-meta">
        <h3 title={collection.name}>{collection.name}</h3>
        <p>{pluralize(collection.photosCount, 'photo')}</p>
      </div>
    </CardRoot>
  );
}

export function CollectionGrid({ collections, loading, skeletons = 6, corner }) {
  return (
    <div className="album-grid">
      {loading && !collections
        ? Array.from({ length: skeletons }, (_, i) => <AlbumCardSkeleton key={i} />)
        : collections.map((collection) => <CollectionCard key={collection.id} collection={collection} corner={corner?.(collection)} />)}
    </div>
  );
}

export function AlbumCardSkeleton() {
  return (
    <div className="album-card skeleton-card" aria-hidden="true">
      <div className="album-cover skeleton" />
      <div className="album-meta">
        <div className="skeleton" style={{ height: 16, width: '60%' }} />
        <div className="skeleton" style={{ height: 12, width: '30%', marginTop: 8 }} />
      </div>
    </div>
  );
}

export function AlbumGrid({ albums, loading, skeletons = 6 }) {
  return (
    <div className="album-grid">
      {loading && !albums
        ? Array.from({ length: skeletons }, (_, i) => <AlbumCardSkeleton key={i} />)
        : albums.map((album) => <AlbumCard key={album.id} album={album} />)}
    </div>
  );
}
