import { Check, CopyPlus, Globe, LayoutGrid, Palette, RotateCcw, Type } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AlbumPickerModal } from '../components/AlbumPickerModal';
import { CoverHero } from '../components/CoverHero';
import { ErrorState, Field, PageHeader, PageLoader, Spinner } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../hooks/useToast';
import { albumLabel } from '../lib/albums';
import { api } from '../lib/api';
import { pluralize } from '../lib/format';
import { AUTO_THEME, THEME_GROUPS, resolveTheme, themeByKey } from '../lib/themes';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function SitePage() {
  const { user } = useAuth();
  const toast = useToast();
  const saved = useFetch(() => api.getSiteSettings(), []);
  const { data: showcase } = useFetch(() => api.showcase(24), [saved.data]);
  const { data: albums } = useFetch(() => api.listAlbums(), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (saved.data && !form) setForm(saved.data);
  }, [saved.data, form]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setShowcase = (patch) => setForm((f) => ({ ...f, showcase: { ...f.showcase, ...patch } }));
  const dirty = form && saved.data && !same(form, saved.data);
  const theme = themeByKey(form?.theme);
  const chosen = useMemo(
    () => (form?.showcase.albumIds || []).map((id) => albums?.find((a) => a.id === id)).filter(Boolean),
    [form, albums],
  );

  if (saved.loading && !saved.data) return <PageLoader />;
  if (saved.error && !saved.data) return <ErrorState error={saved.error} onRetry={saved.reload} />;
  if (!form) return <PageLoader />;

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api.updateSiteSettings(form);
      saved.setData(result);
      setForm(result);
      toast.success('Page d’accueil mise à jour');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Personnalisation"
        subtitle="Les textes, l’apparence et les photos de la page d’accueil."
      />

      <div className="site-layout">
        <form className="site-form" onSubmit={save}>
          <section className="card card-body form-grid">
            <h2 className="site-heading"><Type aria-hidden="true" /> Textes de la couverture</h2>
            <Field label="Titre" htmlFor="hero-title" hint="Écrivez {prénom} pour saluer la personne connectée. Vide : « Bonjour Prénom, » ou « Vos photos, ».">
              <input id="hero-title" className="input" maxLength={120} value={form.heroTitle} onChange={(e) => set('heroTitle')(e.target.value)} placeholder="Bonjour {prénom}," />
            </Field>
            <Field label="Deuxième ligne" htmlFor="hero-subtitle" hint="Affichée en plus discret sous le titre.">
              <input id="hero-subtitle" className="input" maxLength={160} value={form.heroSubtitle} onChange={(e) => set('heroSubtitle')(e.target.value)} placeholder="que partage-t-on aujourd’hui ?" />
            </Field>
            <Field label="Texte de présentation" htmlFor="hero-text" hint={`${form.heroText.length} / 600 · vide : le texte par défaut`}>
              <textarea id="hero-text" className="textarea" rows={4} maxLength={600} value={form.heroText} onChange={(e) => set('heroText')(e.target.value)} placeholder="Des albums publics pour tout le monde, des albums protégés pour vos proches…" />
            </Field>
          </section>

          <section className="card card-body form-grid">
            <h2 className="site-heading"><Palette aria-hidden="true" /> Thème</h2>
            <Field label="Apparence de la couverture" htmlFor="hero-theme">
              <select id="hero-theme" className="select" value={form.theme} onChange={(e) => set('theme')(e.target.value)}>
                <option value={AUTO_THEME.key}>{AUTO_THEME.label} (selon la date)</option>
                {THEME_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.themes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
            <p className="theme-note">
              {theme.description}
              {form.theme === 'auto' && <> Aujourd’hui : <strong>{themeByKey(resolveTheme('auto')).label}</strong>.</>}
            </p>
          </section>

          <section className="card card-body form-grid">
            <h2 className="site-heading"><LayoutGrid aria-hidden="true" /> Photos du mur</h2>
            <div className="segmented" role="group" aria-label="Photos du mur">
              <button type="button" aria-pressed={form.showcase.mode === 'all'} onClick={() => setShowcase({ mode: 'all' })}>
                <Globe aria-hidden="true" /> Tous les albums publics
              </button>
              <button type="button" aria-pressed={form.showcase.mode === 'albums'} onClick={() => setShowcase({ mode: 'albums' })}>
                <Check aria-hidden="true" /> Albums choisis
              </button>
            </div>
            {form.showcase.mode === 'albums' && (
              <div className="chosen-albums">
                {chosen.length ? (
                  <ul>
                    {chosen.map((album) => (
                      <li key={album.id}>
                        <span className="truncate">{albumLabel(album)}</span>
                        {album.visibility === 'protected' && <span className="badge badge-warning">protégé : ignoré</span>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">Aucun album choisi : le mur restera vide.</p>}
                <button type="button" className="btn" onClick={() => setPicking(true)}>
                  <CopyPlus aria-hidden="true" /> {chosen.length ? 'Modifier la sélection' : 'Choisir les albums'}
                </button>
              </div>
            )}
            <p className="field-hint">
              Seules les photos des albums publics apparaissent, sous-albums compris. Pour un mur « best of », créez un album
              Best of et ajoutez-y vos meilleures photos depuis la visionneuse (bouton « Ajouter à d’autres albums »), sans les dupliquer.
            </p>
          </section>

          <div className="site-actions">
            <button type="button" className="btn" disabled={!dirty || busy} onClick={() => setForm(saved.data)}>
              <RotateCcw aria-hidden="true" /> Annuler les modifications
            </button>
            <button type="submit" className="btn btn-primary" disabled={!dirty || busy}>
              {busy ? <Spinner /> : <Check aria-hidden="true" />} Enregistrer
            </button>
          </div>
        </form>

        <aside className="site-preview">
          <div className="site-preview-head">
            <span>Aperçu</span>
            <span className="muted">{dirty ? 'non enregistré' : 'tel qu’en ligne'}</span>
          </div>
          <CoverHero settings={form} showcase={showcase} user={user} canUpload preview />
          <p className="field-hint">
            Le mur de l’aperçu montre les photos actuellement en ligne
            {showcase ? ` (${pluralize(showcase.totalPhotos, 'photo')})` : ''} ; un changement de source se voit après l’enregistrement.
          </p>
        </aside>
      </div>

      <AlbumPickerModal
        open={picking}
        title="Albums du mur"
        description="Les photos de ces albums (et de leurs sous-albums) défileront sur la page d’accueil."
        albums={albums}
        initialIds={form.showcase.albumIds}
        allowEmpty
        onClose={() => setPicking(false)}
        onConfirm={(ids) => {
          setShowcase({ albumIds: ids });
          setPicking(false);
        }}
      />
    </>
  );
}
