import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { photoUrl, thumbnailUrl } from '../lib/api';
import { PhotoWall } from './PhotoWall';

/* Backgrounds of the home page cover, chosen in Administration › Personnalisation.
   All are decorative (aria-hidden, out of the tab order) and only use transforms
   and opacity, so they stay smooth; most pause off-screen with the rest of the cover. */

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const photoLink = (photo) => `/albums/${photo.albumId}?photo=${photo.id}`;

/** Advances an index every `ms` milliseconds while the page is visible. */
function useTicker(count, ms) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (count < 2) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) setTick((t) => t + 1);
    }, ms);
    return () => clearInterval(timer);
  }, [count, ms]);
  return tick;
}

/** One large photo at a time, slowly zooming (Ken Burns), cross-fading to the next. */
function SlideBackground({ photos }) {
  const list = useMemo(() => photos.slice(0, 12), [photos]);
  const tick = useTicker(list.length, 7000);
  const [ready, setReady] = useState(() => new Set());
  const current = list.length ? tick % list.length : 0;
  // The previous slide keeps zooming while it fades out, so nothing jumps.
  const previous = list.length > 1 ? (current - 1 + list.length) % list.length : -1;

  // Originals: thumbnails would look blurry this large. The next one loads in advance.
  useEffect(() => {
    [current, (current + 1) % Math.max(list.length, 1)].forEach((i) => {
      const photo = list[i];
      if (!photo || ready.has(photo.id)) return;
      const img = new Image();
      img.src = photoUrl(photo.id);
      img.decode().then(() => setReady((set) => new Set(set).add(photo.id)), () => {});
    });
  }, [current, list, ready]);

  return (
    <div className="cover-bg cover-slides" aria-hidden="true">
      {list.map((photo, i) => (
        <div
          key={photo.id}
          className={`cover-slide kb-${i % 2}${i === current && ready.has(photo.id) ? ' on' : ''}${i === previous && tick ? ' was' : ''}`}
        >
          {(ready.has(photo.id) || i === current) && <img src={photoUrl(photo.id)} alt="" draggable={false} />}
        </div>
      ))}
    </div>
  );
}

/** A flat grid; every couple of seconds one cell fades to a photo not shown yet. */
function GridBackground({ photos }) {
  const cells = 24;
  const [shown, setShown] = useState(() => Array.from({ length: cells }, (_, i) => i));
  const tick = useTicker(photos.length > cells ? photos.length : 0, 2200);

  useEffect(() => {
    if (!tick || photos.length <= cells || prefersReducedMotion()) return;
    setShown((current) => {
      const unused = photos.map((_, i) => i).filter((i) => !current.includes(i));
      const next = [...current];
      next[(tick * 7) % cells] = unused[tick % unused.length];
      return next;
    });
  }, [tick, photos]);

  return (
    <div className="cover-bg cover-grid" aria-hidden="true">
      {shown.map((index, cell) => {
        const photo = photos.length ? photos[index % photos.length] : null;
        return photo ? (
          <Link key={`${cell}-${photo.id}`} to={photoLink(photo)} className="grid-cell" tabIndex={-1} draggable={false}>
            <img src={thumbnailUrl(photo.id)} alt="" loading="lazy" draggable={false} />
          </Link>
        ) : <span key={cell} className="grid-cell empty" style={{ '--h': (cell * 37) % 360 }} />;
      })}
    </div>
  );
}

/** Prints scattered on the right, each slightly turned, floating gently. */
function PolaroidBackground({ photos }) {
  const prints = useMemo(() => Array.from({ length: 11 }, (_, i) => ({
    photo: photos.length ? photos[i % photos.length] : null,
    x: [52, 70, 86, 60, 78, 95, 48, 66, 84, 57, 91][i],
    y: [8, 2, 12, 34, 30, 40, 60, 58, 66, 84, 88][i],
    r: [-8, 6, -4, 9, -11, 5, -6, 12, -3, 7, -9][i],
  })), [photos]);
  return (
    <div className="cover-bg cover-prints" aria-hidden="true">
      {prints.map(({ photo, x, y, r }, i) => (
        <div key={i} className="print" style={{ '--x': `${x}%`, '--y': `${y}%`, '--r': `${r}deg`, '--d': `${-i * 1.3}s` }}>
          {photo ? (
            <Link to={photoLink(photo)} tabIndex={-1} draggable={false}>
              <img src={thumbnailUrl(photo.id)} alt="" loading="lazy" draggable={false} />
            </Link>
          ) : <span className="print-empty" style={{ '--h': (i * 47) % 360 }} />}
        </div>
      ))}
    </div>
  );
}

/** Two strips of 35 mm film crossing the cover in opposite directions. */
function FilmBackground({ photos }) {
  const strips = [0, 1].map((s) => {
    const frames = Array.from({ length: 10 }, (_, i) => (photos.length ? photos[(i * 2 + s) % photos.length] : null));
    return [...frames, ...frames];
  });
  return (
    <div className="cover-bg cover-film" aria-hidden="true">
      {strips.map((frames, s) => (
        <div key={s} className={`film-strip strip-${s}`}>
          <div className="film-track">
            {frames.map((photo, i) => (
              <div key={i} className="film-frame">
                {photo ? (
                  <Link to={photoLink(photo)} tabIndex={-1} draggable={false}>
                    <img src={thumbnailUrl(photo.id)} alt="" loading="lazy" draggable={false} />
                  </Link>
                ) : <span className="print-empty" style={{ '--h': (i * 47) % 360 }} />}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CoverBackground({ type, photos, wallRef }) {
  const list = photos || [];
  switch (type) {
    case 'fondu': return <SlideBackground photos={list} />;
    case 'grille': return <GridBackground photos={list} />;
    case 'polaroids': return <PolaroidBackground photos={list} />;
    case 'pellicule': return <FilmBackground photos={list} />;
    case 'uni': return <div className="cover-bg cover-plain" aria-hidden="true" />;
    default: return <PhotoWall ref={wallRef} photos={photos} />;
  }
}
