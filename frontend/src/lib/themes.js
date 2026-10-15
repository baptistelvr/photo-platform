/**
 * Looks of the home page cover. Each skin restyles the hero (colours, title
 * font, wall filter) and may add a light decoration (snow, leaves…).
 * Keys match the ones accepted by the API (backend/src/utils/schemas.js).
 */
export const THEME_GROUPS = [
  {
    label: 'Toute l’année',
    themes: [
      { key: 'classique', label: 'Classique', description: 'Clair et sobre, suit le mode clair ou sombre du site.' },
      { key: 'minuit', label: 'Minuit', description: 'Bleu nuit, ciel étoilé, les photos en lumière.' },
      { key: 'argentique', label: 'Argentique', description: 'Papier crème, photos sépia, grain de pellicule et titre à empattements.' },
      { key: 'ocean', label: 'Océan', description: 'Bleu profond et petites bulles qui remontent.' },
      { key: 'terracotta', label: 'Terracotta', description: 'Tons chauds de terre cuite, ambiance méditerranéenne.' },
    ],
  },
  {
    label: 'Saisons',
    themes: [
      { key: 'printemps', label: 'Printemps', description: 'Vert tendre et pétales de cerisier qui volent.' },
      { key: 'ete', label: 'Été', description: 'Soleil doré et reflets de lumière.' },
      { key: 'automne', label: 'Automne', description: 'Tons cuivrés et feuilles qui tombent.' },
      { key: 'hiver', label: 'Hiver', description: 'Bleu glacier et neige qui tombe doucement.' },
    ],
  },
  {
    label: 'Fêtes',
    themes: [
      { key: 'halloween', label: 'Halloween', description: 'Nuit violette, lune orange et chauves-souris.' },
      { key: 'noel', label: 'Noël', description: 'Vert sapin, guirlande lumineuse et neige.' },
      { key: 'saint-valentin', label: 'Saint-Valentin', description: 'Rose poudré et cœurs qui s’envolent.' },
    ],
  },
];

export const AUTO_THEME = {
  key: 'auto',
  label: 'Automatique',
  description: 'Change tout seul : Halloween fin octobre, Noël en décembre, Saint-Valentin en février, sinon la saison du moment.',
};

export const ALL_THEMES = [AUTO_THEME, ...THEME_GROUPS.flatMap((group) => group.themes)];

export const themeByKey = (key) => ALL_THEMES.find((theme) => theme.key === key) || ALL_THEMES[1];

/** The skin shown on a given day for the "auto" setting. */
export function seasonalTheme(date = new Date()) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const md = month * 100 + day;
  if (md >= 1018 && md <= 1101) return 'halloween';
  if (md >= 1201 || md <= 106) return 'noel';
  if (md >= 207 && md <= 214) return 'saint-valentin';
  if (md >= 320 && md < 621) return 'printemps';
  if (md >= 621 && md < 923) return 'ete';
  if (md >= 923 && md < 1221) return 'automne';
  return 'hiver';
}

export const resolveTheme = (key, date) => (key === 'auto' ? seasonalTheme(date) : key || 'classique');

/** "{prénom}" in a cover text becomes the visitor's first name (or disappears for anonymous visitors). */
export function fillName(text, firstName) {
  return text.replace(/\s*\{pr[ée]nom\}/gi, firstName ? ` ${firstName}` : '').replace(/\s+([,.])/g, '$1').trim();
}

/** How the cover shows the photos (keys match backend/src/utils/schemas.js). */
export const BACKGROUNDS = [
  { key: 'mosaique', label: 'Mosaïque 3D', description: 'Le mur incliné qui défile, d’origine.' },
  { key: 'fondu', label: 'Fondu enchaîné', description: 'Une grande photo à la fois, qui zoome lentement puis laisse place à la suivante.' },
  { key: 'grille', label: 'Grille vivante', description: 'Une grille à plat dont les photos se renouvellent une à une.' },
  { key: 'polaroids', label: 'Polaroïds', description: 'Des tirages éparpillés sur la table, qui flottent doucement.' },
  { key: 'pellicule', label: 'Pellicule', description: 'Deux bandes de film argentique qui défilent en sens inverse.' },
  { key: 'uni', label: 'Uni', description: 'Pas de photos : la couleur et le décor du thème seuls.' },
];
