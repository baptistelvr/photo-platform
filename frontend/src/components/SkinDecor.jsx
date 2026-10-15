/* Decorations drawn over the cover wall, under the text. Purely decorative:
   CSS-animated, hidden from assistive technologies, frozen for people who
   limit animations (see styles/skins.css). Positions come from the particle
   index, so every render draws the same scene. */

const LEAF = 'M12 2C7 6 4 10 4 14a8 8 0 0 0 16 0c0-4-3-8-8-12zm0 4v15';
const PETAL = 'M12 2c4 4 6 8 6 12a6 6 0 0 1-12 0c0-4 2-8 6-12z';
const HEART = 'M12 21s-7.5-4.7-9.6-9.2C.9 8.5 2.9 4.5 6.6 4.5c2.2 0 3.6 1.2 5.4 3.2 1.8-2 3.2-3.2 5.4-3.2 3.7 0 5.7 4 4.2 7.3C19.5 16.3 12 21 12 21z';
const BAT = 'M12 9c-1-2-3-3-5-3 1 1 1 2 1 3-2-1-5-1-7 1 2 0 4 1 5 3 1-1 3-1 4 0 1-1 1-2 2-2s1 1 2 2c1-1 3-1 4 0 1-2 3-3 5-3-2-2-5-2-7-1 0-1 0-2 1-3-2 0-4 1-5 3z';

const SCENES = {
  hiver: { kind: 'snow', count: 46 },
  noel: { kind: 'snow', count: 38, lights: true },
  automne: { kind: 'leaf', count: 18 },
  printemps: { kind: 'petal', count: 22 },
  ete: { kind: 'bokeh', count: 12, sun: true },
  'saint-valentin': { kind: 'heart', count: 16 },
  halloween: { kind: 'bat', count: 7, moon: true },
  minuit: { kind: 'star', count: 60 },
  ocean: { kind: 'bubble', count: 20 },
  argentique: { kind: 'grain', count: 0 },
};

const COLORS = {
  leaf: ['#c2410c', '#ea580c', '#b45309', '#a16207', '#9a3412'],
  petal: ['#f9a8d4', '#fbcfe8', '#f472b6', '#fecdd3'],
  heart: ['#fb7185', '#f43f5e', '#fda4af', '#e11d48'],
};

const SHAPES = { leaf: LEAF, petal: PETAL, heart: HEART, bat: BAT };

/** A stable pseudo-random number in [0, 1) for particle `i`, attribute `salt`. */
const rand = (i, salt) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function Particle({ kind, i }) {
  const size = {
    snow: 3 + rand(i, 1) * 6,
    leaf: 16 + rand(i, 1) * 14,
    petal: 10 + rand(i, 1) * 10,
    heart: 14 + rand(i, 1) * 18,
    bat: 26 + rand(i, 1) * 20,
    bokeh: 60 + rand(i, 1) * 120,
    star: 1.5 + rand(i, 1) * 2.5,
    bubble: 6 + rand(i, 1) * 16,
  }[kind];
  const style = {
    '--x': `${(rand(i, 2) * 100).toFixed(2)}%`,
    '--y': `${(rand(i, 3) * 100).toFixed(2)}%`,
    '--size': `${size.toFixed(1)}px`,
    '--duration': `${(kind === 'star' ? 2.5 : kind === 'bat' ? 14 : 9) + rand(i, 4) * (kind === 'bokeh' ? 14 : 9)}s`,
    '--delay': `${(-rand(i, 5) * 20).toFixed(2)}s`,
    '--sway': `${(rand(i, 6) * 80 - 40).toFixed(0)}px`,
    '--spin': `${(rand(i, 7) * 720 - 360).toFixed(0)}deg`,
    '--o': (0.45 + rand(i, 8) * 0.5).toFixed(2),
  };
  const path = SHAPES[kind];
  if (!path) return <span className={`decor-p decor-${kind}`} style={style} />;
  const colors = COLORS[kind];
  return (
    <svg className={`decor-p decor-${kind}`} style={style} viewBox="0 0 24 24" width={size} height={size}>
      <path d={path} fill={colors ? colors[i % colors.length] : 'currentColor'} stroke={kind === 'leaf' ? 'rgba(0,0,0,.18)' : 'none'} strokeWidth="0.8" />
    </svg>
  );
}

export function SkinDecor({ skin }) {
  const scene = SCENES[skin];
  if (!scene) return null;
  return (
    <div className={`skin-decor decor-scene-${scene.kind}`} aria-hidden="true">
      {scene.sun && <span className="decor-sun" />}
      {scene.moon && <span className="decor-moon" />}
      {scene.kind === 'grain' && <span className="decor-grain" />}
      {Array.from({ length: scene.count }, (_, i) => <Particle key={i} kind={scene.kind} i={i} />)}
      {scene.lights && (
        <div className="decor-lights">
          {Array.from({ length: 28 }, (_, i) => <span key={i} style={{ '--i': i }} />)}
        </div>
      )}
    </div>
  );
}
