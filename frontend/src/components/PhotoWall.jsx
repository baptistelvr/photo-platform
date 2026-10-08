import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { thumbnailUrl } from '../lib/api';

const ROWS = 6;
const MIN_PER_ROW = 9;
const BASE_TILE_HEIGHT = 170; // px, only used to derive scroll durations
const PLACEHOLDER_RATIOS = [1.5, 0.8, 1.33, 1, 1.78, 0.75];

const clampRatio = (width, height) => (width && height ? Math.min(Math.max(width / height, 0.66), 1.8) : 1.5);

/**
 * Spreads the photos over the rows. Each row starts at a different offset so
 * neighbouring rows do not show the same sequence; with few photos they repeat
 * until every row is wider than the screen.
 */
function buildRows(photos) {
  if (!photos?.length) {
    return Array.from({ length: ROWS }, (_, row) => Array.from({ length: 10 }, (_, i) => ({
      key: `placeholder-${row}-${i}`,
      ratio: PLACEHOLDER_RATIOS[(row * 3 + i) % PLACEHOLDER_RATIOS.length],
      hue: (row * 47 + i * 29) % 360,
    })));
  }
  const step = Math.max(1, Math.ceil(photos.length / ROWS));
  const perRow = Math.max(MIN_PER_ROW, step + 3);
  return Array.from({ length: ROWS }, (_, row) => Array.from({ length: perRow }, (_, i) => {
    const photo = photos[(row * step + i) % photos.length];
    return { key: `${row}-${i}-${photo.id}`, photo, ratio: clampRatio(photo.width, photo.height) };
  }));
}

function WallTile({ tile }) {
  const [loaded, setLoaded] = useState(false);
  const style = { '--ar': tile.ratio };

  if (!tile.photo) {
    return <span className="wall-tile placeholder" style={{ ...style, '--h': tile.hue }} />;
  }
  return (
    <Link
      to={`/albums/${tile.photo.albumId}?photo=${tile.photo.id}`}
      className="wall-tile"
      style={style}
      tabIndex={-1}
      draggable={false}
    >
      <img
        src={thumbnailUrl(tile.photo.id)}
        alt=""
        decoding="async"
        draggable={false}
        className={loaded ? 'loaded' : undefined}
        onLoad={() => setLoaded(true)}
      />
    </Link>
  );
}

/**
 * Decorative 3D wall of photos scrolling in alternating directions. Purely
 * CSS-animated (transform only), paused on hover, off-screen and for
 * reduced-motion users. Keyboard and screen-reader users get the regular
 * links of the page instead, so the wall stays out of the tab order.
 */
export function PhotoWall({ photos, ref }) {
  const rows = useMemo(() => buildRows(photos), [photos]);

  return (
    <div className="photo-wall" ref={ref} aria-hidden="true">
      {rows.map((tiles, row) => {
        const width = tiles.reduce((sum, tile) => sum + tile.ratio, 0) * BASE_TILE_HEIGHT;
        const speed = 22 + ((row * 7) % 5) * 4; // px per second, varied per row
        return (
          <div
            key={row}
            className="wall-row"
            style={{
              '--duration': `${Math.round(width / speed)}s`,
              '--direction': row % 2 ? 'reverse' : 'normal',
              '--z': `${(row % 3) * 18}px`,
            }}
          >
            {/* Two identical halves: translating by -50% loops seamlessly. */}
            <div className="wall-track">
              {tiles.map((tile) => <WallTile key={tile.key} tile={tile} />)}
              {tiles.map((tile) => <WallTile key={`copy-${tile.key}`} tile={tile} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
