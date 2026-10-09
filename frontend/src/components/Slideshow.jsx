import {
  ChevronLeft, ChevronRight, ListOrdered, LoaderCircle, Maximize, Minimize, Minus, Pause, Play, Plus, RotateCcw, Shuffle, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../hooks/useToast';
import { photoUrl } from '../lib/api';
import { pluralize } from '../lib/format';
import { Modal } from './Modal';
import { Spinner } from './ui';

const MIN_SECONDS = 1;
const MAX_SECONDS = 120;
const SETTINGS_KEY = 'slideshow:settings';
const DEFAULTS = { seconds: 5, shuffle: false, loop: true, fullscreen: true };
const IDLE_MS = 2600;

const clampSeconds = (value) => Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(Number(value) || DEFAULTS.seconds)));
// The fade never takes more than 40 % of a slide, so short durations stay readable.
const fadeMs = (seconds) => Math.min(1400, seconds * 400);
const canFullscreen = () => Boolean(document.fullscreenEnabled);

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...DEFAULTS, ...saved, seconds: clampSeconds(saved.seconds ?? DEFAULTS.seconds) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or blocked storage: the settings simply are not remembered.
  }
}

function formatTotal(seconds) {
  if (seconds < 90) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Playing order and first position. In order, the show starts at the chosen
 * photo (or the first one) and keeps the album numbering; shuffled, the chosen
 * photo comes first, if any.
 */
function buildOrder(count, startIndex, shuffle) {
  const order = Array.from({ length: count }, (_, i) => i);
  if (!shuffle) return { order, first: startIndex ?? 0 };
  const rest = order.filter((i) => i !== startIndex);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return { order: startIndex === null ? rest : [startIndex, ...rest], first: 0 };
}

/* ---------- Settings dialog ---------- */

function SlideshowSetup({ open, count, busy, onClose, onStart }) {
  const [settings, setSettings] = useState(readSettings);
  const set = (key) => (value) => setSettings((s) => ({ ...s, [key]: value }));

  useEffect(() => {
    if (open) setSettings(readSettings());
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title="Diaporama"
      description={`${pluralize(count, 'photo')} · environ ${formatTotal(count * clampSeconds(settings.seconds))}`}
      onSubmit={() => {
        const final = { ...settings, seconds: clampSeconds(settings.seconds) };
        saveSettings(final);
        onStart(final);
      }}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !count}>
            {busy ? <Spinner /> : <Play aria-hidden="true" />} Lancer
          </button>
        </>
      )}
    >
      <div className="form-grid">
        <div className="field">
          <label className="field-label" htmlFor="slideshow-seconds">Durée d’affichage de chaque photo</label>
          <div className="duration-field">
            <input
              type="range"
              min={MIN_SECONDS}
              max={30}
              value={Math.min(settings.seconds, 30)}
              onChange={(e) => set('seconds')(Number(e.target.value))}
              aria-label="Durée en secondes"
            />
            <div className="duration-input">
              <input
                id="slideshow-seconds"
                className="input"
                type="number"
                inputMode="numeric"
                min={MIN_SECONDS}
                max={MAX_SECONDS}
                value={settings.seconds}
                onChange={(e) => set('seconds')(e.target.value === '' ? '' : Number(e.target.value))}
                onBlur={() => set('seconds')(clampSeconds(settings.seconds))}
                required
              />
              <span>s</span>
            </div>
          </div>
          <p className="field-hint">De {MIN_SECONDS} à {MAX_SECONDS} secondes. Modifiable aussi pendant la lecture.</p>
        </div>

        <div className="field">
          <span className="field-label">Ordre</span>
          <div className="segmented" role="group" aria-label="Ordre des photos">
            <button type="button" aria-pressed={!settings.shuffle} onClick={() => set('shuffle')(false)}>
              <ListOrdered aria-hidden="true" /> Dans l’ordre
            </button>
            <button type="button" aria-pressed={settings.shuffle} onClick={() => set('shuffle')(true)}>
              <Shuffle aria-hidden="true" /> Aléatoire
            </button>
          </div>
        </div>

        <label className="checkbox">
          <input type="checkbox" checked={settings.loop} onChange={(e) => set('loop')(e.target.checked)} />
          <span>Recommencer au début une fois terminé</span>
        </label>
        {canFullscreen() && (
          <label className="checkbox">
            <input type="checkbox" checked={settings.fullscreen} onChange={(e) => set('fullscreen')(e.target.checked)} />
            <span>Plein écran</span>
          </label>
        )}
      </div>
    </Modal>
  );
}

/* ---------- Player ---------- */

function SlideshowPlayer({ photos, startIndex, settings, title, onClose }) {
  const rootRef = useRef(null);
  const { order, first } = useMemo(
    () => buildOrder(photos.length, startIndex, settings.shuffle),
    [photos.length, startIndex, settings.shuffle],
  );
  const [seconds, setSeconds] = useState(settings.seconds);
  const [playing, setPlaying] = useState(true);
  const [ended, setEnded] = useState(false);
  const [slides, setSlides] = useState([]); // [{ key, position, leaving }], the last one is on screen
  const [waiting, setWaiting] = useState(false);
  const [idle, setIdle] = useState(false);
  const [flash, setFlash] = useState(null);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));

  const decoded = useRef(new Map());
  const request = useRef(0);
  const slideKey = useRef(0);
  const elapsed = useRef({ id: null, ms: 0 });
  const lastActivity = useRef(0);
  const touchStart = useRef(null);

  const current = slides[slides.length - 1];
  const position = current?.position ?? 0;
  const photo = current ? photos[order[current.position]] : null;
  const fade = fadeMs(seconds);
  const single = order.length < 2;

  /** Resolves once the photo is decoded, so it never fades in half drawn. */
  const load = useCallback((pos) => {
    const url = photoUrl(photos[order[pos]].id);
    if (!decoded.current.has(url)) {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      decoded.current.set(url, img.decode().then(() => true, () => false));
    }
    return decoded.current.get(url);
  }, [order, photos]);

  const wrap = useCallback((pos) => (pos + order.length) % order.length, [order.length]);

  const show = useCallback(async (target, direction = 1) => {
    const token = request.current + 1;
    request.current = token;
    const slow = setTimeout(() => {
      if (request.current === token) setWaiting(true);
    }, 350);
    let pos = target;
    let ok = false;
    // An unreadable photo is skipped instead of freezing the show.
    for (let tries = 0; tries < order.length && !ok; tries += 1) {
      ok = await load(pos);
      if (request.current !== token) {
        clearTimeout(slow);
        return;
      }
      if (!ok) pos = wrap(pos + direction);
    }
    clearTimeout(slow);
    setWaiting(false);
    if (!ok) return;
    slideKey.current += 1;
    const key = slideKey.current;
    setSlides((list) => [...list.slice(-1).map((s) => ({ ...s, leaving: true })), { key, position: pos, leaving: false }]);
  }, [load, order.length, wrap]);

  const next = useCallback((manual = false) => {
    if (single) return;
    if (position === order.length - 1 && !settings.loop) {
      if (!manual) {
        setPlaying(false);
        setEnded(true);
      }
      return;
    }
    setEnded(false);
    show(wrap(position + 1), 1);
  }, [single, position, order.length, settings.loop, show, wrap]);

  const prev = useCallback(() => {
    if (single || (position === 0 && !settings.loop)) return;
    setEnded(false);
    show(wrap(position - 1), -1);
  }, [single, position, settings.loop, show, wrap]);

  const restart = useCallback(() => {
    setEnded(false);
    setPlaying(true);
    show(0, 1);
  }, [show]);

  const togglePlay = useCallback(() => {
    if (ended) {
      restart();
      return;
    }
    setPlaying(!playing);
    setFlash({ id: Date.now(), playing: !playing });
  }, [ended, restart, playing]);

  const wake = useCallback(() => {
    lastActivity.current = performance.now();
    setIdle(false);
  }, []);

  const changeSeconds = useCallback((delta) => setSeconds((s) => clampSeconds(s + delta)), []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  // First photo.
  useEffect(() => {
    show(first, 1);
  }, [show, first]);

  // Warm up the next photos while this one is on screen.
  useEffect(() => {
    if (!current || single) return;
    [1, 2].forEach((step) => {
      const pos = position + step;
      if (pos < order.length || settings.loop) load(wrap(pos));
    });
  }, [current, position, single, order.length, settings.loop, load, wrap]);

  // Countdown to the next photo, paused and resumed without losing the time already spent.
  const timerId = current ? `${current.key}:${seconds}` : null;
  useEffect(() => {
    if (!timerId || !playing || ended || single) return undefined;
    if (elapsed.current.id !== timerId) elapsed.current = { id: timerId, ms: 0 };
    const started = performance.now();
    const timeout = setTimeout(() => next(), Math.max(0, seconds * 1000 - elapsed.current.ms));
    return () => {
      clearTimeout(timeout);
      if (elapsed.current.id === timerId) elapsed.current.ms += performance.now() - started;
    };
  }, [timerId, playing, ended, single, seconds, next]);

  // Keyboard.
  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.('dialog, input, select, textarea')) return;
      // A focused button already reacts to Space and Enter on its own.
      if ((event.key === ' ' || event.key === 'Enter') && event.target.closest?.('button')) return;
      const actions = {
        ' ': togglePlay,
        k: togglePlay,
        ArrowRight: () => next(true),
        ArrowLeft: prev,
        Escape: onClose,
        f: toggleFullscreen,
        '+': () => changeSeconds(1),
        '=': () => changeSeconds(1),
        '-': () => changeSeconds(-1),
        ArrowUp: () => changeSeconds(1),
        ArrowDown: () => changeSeconds(-1),
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      wake();
      action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, next, prev, onClose, toggleFullscreen, changeSeconds, wake]);

  // Controls fade away after a moment without activity, unless paused or hovered.
  useEffect(() => {
    if (idle || !playing || ended) return undefined;
    let timeout;
    const check = () => {
      const left = IDLE_MS - (performance.now() - lastActivity.current);
      if (rootRef.current?.querySelector('.slideshow-ui:hover')) timeout = setTimeout(check, IDLE_MS);
      else if (left > 0) timeout = setTimeout(check, left);
      else setIdle(true);
    };
    timeout = setTimeout(check, IDLE_MS);
    return () => clearTimeout(timeout);
  }, [idle, playing, ended]);

  // Page scroll locked, focus inside, full screen if asked; everything restored on close.
  useEffect(() => {
    const previous = document.activeElement;
    document.body.style.overflow = 'hidden';
    rootRef.current?.focus();
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      previous?.focus?.();
    };
  }, []);

  // Keep the screen awake during the show (ignored where unsupported).
  useEffect(() => {
    if (!playing || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    let released = false;
    const acquire = () => navigator.wakeLock.request('screen').then((l) => {
      if (released) l.release().catch(() => {});
      else lock = l;
    }).catch(() => {});
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      released = true;
      lock?.release().catch(() => {});
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [playing]);

  const atStart = !settings.loop && position === 0;
  const atEnd = !settings.loop && position === order.length - 1;

  return createPortal(
    <div
      ref={rootRef}
      className={`slideshow${idle ? ' idle' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Diaporama : ${title}`}
      tabIndex={-1}
      style={{ '--fade': `${fade}ms` }}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse') wake();
      }}
      onPointerDown={wake}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0].clientX;
      }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return;
        const delta = event.changedTouches[0].clientX - touchStart.current;
        touchStart.current = null;
        if (Math.abs(delta) > 50) {
          if (delta < 0) next(true);
          else prev();
        }
      }}
    >
      <div className="slideshow-stage" onClick={togglePlay}>
        {slides.map((slide) => {
          const item = photos[order[slide.position]];
          return (
            <img
              key={slide.key}
              className={`slide ${slide.leaving ? 'leaving' : 'entering'}`}
              src={photoUrl(item.id)}
              alt={slide.leaving ? '' : item.originalName}
              draggable={false}
              onAnimationEnd={slide.leaving ? () => setSlides((list) => list.filter((s) => s.key !== slide.key)) : undefined}
            />
          );
        })}
        {(waiting || !current) && <div className="slideshow-wait"><LoaderCircle className="spin" aria-hidden="true" /></div>}
        {flash && (
          <div key={flash.id} className="slideshow-flash" aria-hidden="true" onAnimationEnd={() => setFlash(null)}>
            {flash.playing ? <Play /> : <Pause />}
          </div>
        )}
      </div>

      <div className="slideshow-top slideshow-ui">
        <div className="slideshow-title">
          <strong>{title}</strong>
          <span>
            {photo?.albumName ? `${photo.albumName} · ` : ''}
            {position + 1} / {order.length}
          </span>
        </div>
        {canFullscreen() && (
          <button type="button" className="icon-btn" onClick={toggleFullscreen} aria-label={fullscreen ? 'Quitter le plein écran (F)' : 'Plein écran (F)'} title={fullscreen ? 'Quitter le plein écran (F)' : 'Plein écran (F)'}>
            {fullscreen ? <Minimize /> : <Maximize />}
          </button>
        )}
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer le diaporama (Échap)" title="Fermer (Échap)">
          <X />
        </button>
      </div>

      <div className="slideshow-bottom slideshow-ui">
        <div className="slideshow-duration" role="group" aria-label="Durée par photo">
          <button type="button" className="icon-btn sm" onClick={() => changeSeconds(-1)} disabled={seconds <= MIN_SECONDS} aria-label="Une seconde de moins">
            <Minus />
          </button>
          <span aria-live="polite">{seconds} s</span>
          <button type="button" className="icon-btn sm" onClick={() => changeSeconds(1)} disabled={seconds >= MAX_SECONDS} aria-label="Une seconde de plus">
            <Plus />
          </button>
        </div>
        <div className="slideshow-transport">
          <button type="button" className="icon-btn" onClick={prev} disabled={single || atStart} aria-label="Photo précédente (←)" title="Précédente (←)">
            <ChevronLeft />
          </button>
          <button
            type="button"
            className="icon-btn slideshow-play"
            onClick={togglePlay}
            aria-label={ended ? 'Revoir depuis le début' : playing ? 'Pause (Espace)' : 'Lecture (Espace)'}
            title={ended ? 'Revoir' : playing ? 'Pause (Espace)' : 'Lecture (Espace)'}
          >
            {ended ? <RotateCcw /> : playing ? <Pause /> : <Play />}
          </button>
          <button type="button" className="icon-btn" onClick={() => next(true)} disabled={single || atEnd} aria-label="Photo suivante (→)" title="Suivante (→)">
            <ChevronRight />
          </button>
        </div>
        <div className="slideshow-order">{settings.shuffle ? <><Shuffle aria-hidden="true" /> Aléatoire</> : null}</div>
      </div>

      {timerId && !single && (
        <div className="slideshow-progress slideshow-ui" aria-hidden="true">
          <span
            key={timerId}
            style={{
              '--slide-duration': `${seconds}s`,
              animationPlayState: playing && !ended ? 'running' : 'paused',
            }}
          />
        </div>
      )}

      {ended && (
        <div className="slideshow-end">
          <p>Fin du diaporama</p>
          <div>
            <button type="button" className="btn" onClick={restart}><RotateCcw aria-hidden="true" /> Revoir</button>
            <button type="button" className="btn btn-primary" onClick={onClose}>Fermer</button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

/* ---------- Glue ---------- */

/**
 * Slideshow for a list of photos (an album, or a whole collection). `open()`
 * shows the settings, optionally starting from a given photo; `element` must
 * be rendered once by the page.
 */
export function useSlideshow({ title, count, loadPhotos }) {
  const toast = useToast();
  const [setup, setSetup] = useState(null); // { startId } while the settings are open
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(null); // { photos, startIndex, settings } while playing

  const open = useCallback((startId = null) => setSetup({ startId }), []);

  const start = async (settings) => {
    // Full screen must be requested right in the click, before anything asynchronous.
    if (settings.fullscreen && canFullscreen() && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
    setBusy(true);
    try {
      const photos = await loadPhotos();
      if (!photos.length) {
        toast.info('Aucune photo à montrer.');
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        return;
      }
      const found = photos.findIndex((p) => p.id === setup?.startId);
      const startIndex = found >= 0 ? found : null;
      setShow({ photos, startIndex, settings });
      setSetup(null);
    } catch (error) {
      toast.error(error.message);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const element = (
    <>
      <SlideshowSetup open={Boolean(setup)} count={count} busy={busy} onClose={() => setSetup(null)} onStart={start} />
      {show && (
        <SlideshowPlayer
          photos={show.photos}
          startIndex={show.startIndex}
          settings={show.settings}
          title={title}
          onClose={() => setShow(null)}
        />
      )}
    </>
  );

  return { open, element };
}
