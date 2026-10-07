import { ArrowRight, Image as ImageIcon, Images, LogIn, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AlbumGrid } from '../components/AlbumCard';
import { EmptyState } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useFetch } from '../hooks/useFetch';
import { api, thumbnailUrl } from '../lib/api';

function Mosaic({ albums }) {
  // One tile per album cover; with fewer than four albums, complete with photos
  // from the fullest album so the mosaic is never half empty.
  const covers = (albums || []).filter((a) => a.coverPhotoId).slice(0, 4)
    .map((a) => ({ photoId: a.coverPhotoId, to: `/collections/${a.id}`, label: a.name }));
  const source = covers.length < 4
    ? [...(albums || [])].sort((a, b) => b.photosCount - a.photosCount).find((a) => a.photosCount > 1)
    : null;
  const { data: extra } = useFetch(
    () => (source ? api.listAlbumPhotos(source.id) : Promise.resolve([])),
    [source?.id],
  );

  const used = new Set(covers.map((t) => t.photoId));
  const tiles = [
    ...covers,
    ...(extra || []).filter((p) => !used.has(p.id))
      .map((p) => ({ photoId: p.id, to: `/collections/${source.id}?photo=${p.id}`, label: source.name })),
  ].slice(0, 4);

  if (tiles.length < 4) {
    return (
      <div className="hero-mosaic placeholder" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <div key={i}><ImageIcon /></div>)}
      </div>
    );
  }
  return (
    <div className="hero-mosaic">
      {tiles.map((tile) => (
        <Link key={tile.photoId} to={tile.to} aria-label={tile.label}>
          <img src={thumbnailUrl(tile.photoId)} alt="" loading="lazy" />
        </Link>
      ))}
    </div>
  );
}

export function HomePage() {
  const { isAuthenticated, user, hasPermission } = useAuth();
  const { data: albums, loading } = useFetch(() => api.listAlbums(), [user?.id]);
  const recent = albums?.slice(0, 6);

  return (
    <>
      <section className="hero">
        <div>
          <h1>
            {isAuthenticated ? `Bonjour ${user.name.split(' ')[0]},` : 'Vos photos,'}
            <br />
            <span className="muted">{isAuthenticated ? 'que partage-t-on aujourd’hui ?' : 'simplement partagées.'}</span>
          </h1>
          <p className="lead">
            Des albums publics pour tout le monde, des albums protégés pour vos proches.
            Les images sont stockées en privé et servies seulement à ceux qui y ont droit.
          </p>
          <div className="hero-actions">
            <Link to="/collections" className="btn btn-primary btn-lg">
              <Images aria-hidden="true" /> Parcourir les collections
            </Link>
            {hasPermission('UPLOAD_PHOTOS') ? (
              <Link to="/upload" className="btn btn-lg">
                <Upload aria-hidden="true" /> Importer des photos
              </Link>
            ) : !isAuthenticated && (
              <Link to="/login" className="btn btn-lg">
                <LogIn aria-hidden="true" /> Se connecter
              </Link>
            )}
          </div>
        </div>
        <Mosaic albums={albums} />
      </section>

      <section>
        <div className="section-header">
          <h2>Albums récents</h2>
          {albums?.length > 6 && (
            <Link to="/collections">Tout voir <ArrowRight aria-hidden="true" /></Link>
          )}
        </div>
        {!loading && !albums?.length ? (
          <EmptyState icon={Images} title="Aucun album pour l’instant">
            {isAuthenticated ? 'Les albums auxquels vous avez accès apparaîtront ici.' : 'Connectez-vous pour voir les albums qui vous sont réservés.'}
          </EmptyState>
        ) : (
          <AlbumGrid albums={recent} loading={loading} skeletons={3} />
        )}
      </section>
    </>
  );
}
