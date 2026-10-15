const { query } = require('../config/db');
const { siteSettingsSchema } = require('../utils/schemas');

/** Site settings with their defaults; unknown or invalid stored values fall back to them. */
async function getSiteSettings() {
  const { rows } = await query("SELECT value FROM site_settings WHERE key = 'site'");
  let stored = {};
  try {
    stored = rows[0] ? JSON.parse(rows[0].value) : {};
  } catch {
    stored = {};
  }
  const parsed = siteSettingsSchema.safeParse(stored);
  return parsed.success ? parsed.data : siteSettingsSchema.parse({});
}

async function saveSiteSettings(settings) {
  await query(`INSERT INTO site_settings (key, value) VALUES ('site', $1)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [JSON.stringify(settings)]);
  return getSiteSettings();
}

module.exports = { getSiteSettings, saveSiteSettings };
