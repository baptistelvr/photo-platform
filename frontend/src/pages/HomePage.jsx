import { ArrowRight, Images, LogIn, Sparkles, Upload } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AlbumGrid } from '../components/AlbumCard';
import { PhotoWall } from '../components/PhotoWall';
import { EmptyState } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import { pluralize } from '../lib/format';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Tilts the wall towards the mouse and pauses it while the hero is off-screen. */
function useShowcaseMotion(sectionRef, wallRef) {
  const frame = useRef(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      section.classList.toggle('paused', !entry.isIntersecting);
    });
    observer.observe(section);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [sectionRef]);

  const setTilt = (x, y) => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      wallRef.current?.style.setProperty('--tx', x.toFixed(3));
      wallRef.current?.style.setProperty('--ty', y.toFixed(3));
    });
  };

  return {
    onPointerMove: (event) => {
      if (event.pointerType !== 'mouse' || prefersReducedMotion()) return;
      const rect = sectionRef.current.getBoundingClientRect();
      setTilt((event.clientX - rect.left) / rect.width - 0.5, (event.clientY - rect.top) / rect.height - 0.5);
    },
    onPointerLeave: () => setTilt(0, 0),
  };
}

export function HomePage() {
  const { isAuthenticated, user, hasPermission } = useAuth();
  const { data: albums, loading } = useFetch(() => api.listAlbums(), [user?.id]);
  const { data: showcase } = useFetch(() => api.showcase(32), []);
  const sectionRef = useRef(null);
  const wallRef = useRef(null);
  const motion = useShowcaseMotion(sectionRef, wallRef);
  const recent = albums?.slice(0, 6);

  return (
    <>
      <section className="showcase" ref={sectionRef} {...motion}>
        <PhotoWall ref={wallRef} photos={showcase?.photos} />
        <div className="showcase-fade" aria-hidden="true" />
        <div className="container showcase-content">
          <div className="showcase-copy">
            {showcase?.totalPhotos > 0 && (
              <span className="showcase-pill">
                <Sparkles aria-hidden="true" />
                {pluralize(showcase.totalPhotos, 'photo')} dans {pluralize(showcase.totalAlbums, 'album public', 'albums publics')}
              </span>
            )}
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
        </div>
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
