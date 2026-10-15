const albumRepository = require('../repositories/albumRepository');
const { addAuditLog } = require('../repositories/auditRepository');
const settingsRepository = require('../repositories/settingsRepository');
const { siteSettingsSchema } = require('../utils/schemas');

/** Public: the home page reads its texts and theme here. */
async function getSiteSettings(_req, res, next) {
  try {
    const settings = await settingsRepository.getSiteSettings();
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
}

async function updateSiteSettings(req, res, next) {
  try {
    const payload = siteSettingsSchema.parse(req.body);
    // Albums deleted meanwhile are dropped silently.
    const links = await albumRepository.albumLinks();
    payload.showcase.albumIds = [...new Set(payload.showcase.albumIds)].filter((id) => links.has(id));
    const saved = await settingsRepository.saveSiteSettings(payload);
    await addAuditLog({ actorId: req.user.id, action: 'SETTINGS_UPDATE', objectType: 'settings', metadata: { theme: saved.theme, showcase: saved.showcase.mode }, ipAddress: req.ip });
    res.json({ success: true, data: saved });
  } catch (error) {
    next(error);
  }
}

module.exports = { getSiteSettings, updateSiteSettings };
