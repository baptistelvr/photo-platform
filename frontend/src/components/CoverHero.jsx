import { Images, LogIn, Sparkles, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { pluralize } from '../lib/format';
import { fillName, resolveTheme } from '../lib/themes';
import { CoverBackground } from './CoverBackgrounds';
import { SkinDecor } from './SkinDecor';

const DEFAULT_TEXT = 'Des albums publics pour tout le monde, des albums protégés pour vos proches. '
  + 'Les images sont stockées en privé et servies seulement à ceux qui y ont droit.';

/**
 * Texts of the cover: the ones set in the administration, or the defaults.
 * A custom title replaces both lines of the default greeting.
 */
function coverTexts(settings, user) {
  const first = user?.name?.split(' ')[0];
  const custom = settings?.heroTitle;
  return {
    title: custom ? fillName(custom, first) : (user ? `Bonjour ${first},` : 'Vos photos,'),
    subtitle: custom
      ? fillName(settings.heroSubtitle || '', first)
      : (settings?.heroSubtitle ? fillName(settings.heroSubtitle, first) : (user ? 'que partage-t-on aujourd’hui ?' : 'simplement partagées.')),
    text: settings?.heroText ? fillName(settings.heroText, first) : DEFAULT_TEXT,
  };
}

/** In the preview, buttons are drawings: nothing navigates away from the settings. */
function Action({ preview, to, className, children }) {
  return preview ? <span className={className}>{children}</span> : <Link to={to} className={className}>{children}</Link>;
}

/**
 * The home page cover: the 3D wall of photos, the skin chosen in the
 * administration and its texts. `preview` draws a small, inert copy.
 */
export function CoverHero({
  settings, showcase, user, canUpload = false, preview = false, sectionRef, wallRef, motion = {},
}) {
  const ready = settings !== undefined;
  const skin = ready ? resolveTheme(settings?.theme) : undefined;
  const background = settings?.background || 'mosaique';
  const { title, subtitle, text } = coverTexts(settings, user);

  return (
    <section
      className={`showcase${preview ? ' preview' : ''}`}
      data-skin={skin}
      data-background={background}
      ref={sectionRef}
      aria-label={preview ? 'Aperçu de la page d’accueil' : undefined}
      {...motion}
    >
      {ready && <CoverBackground type={background} photos={showcase?.photos} wallRef={wallRef} />}
      <div className="showcase-fade" aria-hidden="true" />
      {skin && <SkinDecor skin={skin} />}
      <div className="container showcase-content">
        <div className={`showcase-copy${ready ? '' : ' pending'}`}>
          {showcase?.totalPhotos > 0 && (
            <span className="showcase-pill">
              <Sparkles aria-hidden="true" />
              {pluralize(showcase.totalPhotos, 'photo')} dans {pluralize(showcase.totalAlbums, 'album public', 'albums publics')}
            </span>
          )}
          {preview ? <p className="h1" role="presentation">{title}{subtitle && <><br /><span className="muted">{subtitle}</span></>}</p> : (
            <h1>
              {title}
              {subtitle && <><br /><span className="muted">{subtitle}</span></>}
            </h1>
          )}
          {text && <p className="lead">{text}</p>}
          <div className="hero-actions">
            <Action preview={preview} to="/collections" className="btn btn-primary btn-lg">
              <Images aria-hidden="true" /> Parcourir les collections
            </Action>
            {canUpload ? (
              <Action preview={preview} to="/upload" className="btn btn-lg">
                <Upload aria-hidden="true" /> Importer des photos
              </Action>
            ) : !user && (
              <Action preview={preview} to="/login" className="btn btn-lg">
                <LogIn aria-hidden="true" /> Se connecter
              </Action>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
