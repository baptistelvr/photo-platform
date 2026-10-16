import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { photoUrl, thumbnailUrl } from '../lib/api';
import { PhotoWall } from './PhotoWall';

/* Backgrounds of the home page cover, chosen in Administration › Personnalisation.
   All are decorative (aria-hidden, out of the tab order) and only use transforms
   and opacity, so they stay smooth; most pause off-screen with the rest of the cover. */

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A stable pseudo-random number in [0, 1) for item `i`: the same scene on every render. */
const rand = (i, salt) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
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

/** A flat grid over the whole cover; every couple of seconds one cell fades to a photo not shown yet. */
function GridBackground({ photos }) {
  const cells = 30;
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

const PRINT_COLUMNS = 7;
const PRINT_ROWS = 4;

/**
 * Prints scattered over the whole cover, a little turned and overlapping, like
 * on a table. A jittered grid keeps them evenly spread at any window size; the
 * ones behind the text are dimmed by the cover's veil.
 */
function PolaroidBackground({ photos }) {
  const prints = useMemo(() => Array.from({ length: PRINT_COLUMNS * PRINT_ROWS }, (_, i) => {
    const column = i % PRINT_COLUMNS;
    const row = Math.floor(i / PRINT_COLUMNS);
    return {
      // Odd rows shift by half a column, like bricks, so no straight lines show.
      x: ((column + (row % 2) * 0.5 + 0.2 + rand(i, 1) * 0.6) / PRINT_COLUMNS) * 104 - 2,
      y: ((row + 0.1 + rand(i, 2) * 0.55) / PRINT_ROWS) * 100 - 6,
      r: Math.round(rand(i, 3) * 26 - 13),
      s: (0.86 + rand(i, 4) * 0.3).toFixed(2),
      photo: photos.length ? photos[(i * 5) % photos.length] : null,
    };
  }), [photos]);
  return (
    <div className="cover-bg cover-prints" aria-hidden="true">
      {prints.map(({ photo, x, y, r, s }, i) => (
        <div
          key={i}
          className="print"
          style={{ '--x': `${x.toFixed(1)}%`, '--y': `${y.toFixed(1)}%`, '--r': `${r}deg`, '--s': s, '--d': `${(-i * 1.7) % 9}s` }}
        >
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

/** Three strips of 35 mm film crossing the whole cover, in alternating directions. */
function FilmBackground({ photos }) {
  const strips = [0, 1, 2].map((s) => {
    const frames = Array.from({ length: 10 }, (_, i) => (photos.length ? photos[(i * 3 + s) % photos.length] : null));
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
