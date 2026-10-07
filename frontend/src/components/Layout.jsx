import {
  Aperture, ChevronDown, FolderCog, Images, LogIn, LogOut, Menu, Moon, RefreshCw, ScrollText, Sun,
  TriangleAlert, Upload, UserRound, Users, X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { ROLE_LABELS } from '../lib/labels';
import { Dropdown } from './Dropdown';
import { Avatar } from './ui';

function useNavigation() {
  const { hasPermission, hasAnyPermission } = useAuth();
  const main = [
    { to: '/collections', label: 'Collections', icon: Images },
    hasPermission('UPLOAD_PHOTOS') && { to: '/upload', label: 'Importer', icon: Upload },
  ].filter(Boolean);
  const admin = [
    hasAnyPermission(['CREATE_ALBUMS', 'EDIT_ALBUMS', 'DELETE_ALBUMS']) && { to: '/manage/albums', label: 'Albums', icon: FolderCog },
    hasPermission('MANAGE_USERS') && { to: '/manage/users', label: 'Utilisateurs', icon: Users },
    hasPermission('MANAGE_PERMISSIONS') && { to: '/admin/logs', label: 'Journal d’activité', icon: ScrollText },
  ].filter(Boolean);
  return { main, admin };
}

function NavItem({ to, label, icon: Icon, onClick }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={onClick}>
      <Icon aria-hidden="true" />
      {label}
    </NavLink>
  );
}

function ThemeButton() {
  const { theme, toggleTheme } = useTheme();
  const label = theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre';
  return (
    <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={label} title={label}>
      {theme === 'dark' ? <Sun /> : <Moon />}
    </button>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <Dropdown
      label="Menu du compte"
      trigger={(props) => (
        <button type="button" className="user-trigger" {...props}>
          <Avatar name={user.name} />
          <span className="user-name">{user.name.split(' ')[0]}</span>
          <ChevronDown aria-hidden="true" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="menu-header">
            <div className="cell-title truncate">{user.name}</div>
            <div className="cell-sub truncate">{user.email}</div>
            <span className="badge" style={{ marginTop: 8 }}>{ROLE_LABELS[user.role] || user.role}</span>
          </div>
          <Link to="/account" role="menuitem" className="menu-item" onClick={close}>
            <UserRound aria-hidden="true" /> Mon compte
          </Link>
          <div className="menu-separator" />
          <button
            type="button"
            role="menuitem"
            className="menu-item danger"
            onClick={async () => {
              close();
              await logout();
              navigate('/');
            }}
          >
            <LogOut aria-hidden="true" /> Se déconnecter
          </button>
        </>
      )}
    </Dropdown>
  );
}

function AdminMenu({ items }) {
  const location = useLocation();
  const active = items.some((item) => location.pathname.startsWith(item.to));
  return (
    <Dropdown
      label="Administration"
      trigger={(props) => (
        <button type="button" className={`nav-link${active ? ' active' : ''}`} {...props}>
          Administration
          <ChevronDown aria-hidden="true" style={{ width: 15, height: 15 }} />
        </button>
      )}
    >
      {(close) => items.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} role="menuitem" className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`} onClick={close}>
          <Icon aria-hidden="true" /> {label}
        </NavLink>
      ))}
    </Dropdown>
  );
}

function StatusBanner() {
  const { serverError, refresh } = useAuth();
  const [retrying, setRetrying] = useState(false);
  if (!serverError) return null;
  return (
    <div className="status-banner" role="alert">
      <div className="container">
        <TriangleAlert aria-hidden="true" />
        <p>
          <strong>Le serveur ne répond pas correctement.</strong>{' '}
          {serverError.message}
        </p>
        <button
          type="button"
          className="btn btn-sm"
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            await refresh();
            setRetrying(false);
          }}
        >
          <RefreshCw className={retrying ? 'spin' : undefined} aria-hidden="true" /> Réessayer
        </button>
      </div>
    </div>
  );
}

export function Layout() {
  const { isAuthenticated, user } = useAuth();
  const { main, admin } = useNavigation();
  const location = useLocation();
  // The mobile menu belongs to the page it was opened on, so navigating closes it.
  const [mobileOpenOn, setMobileOpenOn] = useState(null);
  const mobileOpen = mobileOpenOn === location.pathname;
  const setMobileOpen = (update) => setMobileOpenOn((current) => {
    const next = typeof update === 'function' ? update(current === location.pathname) : update;
    return next ? location.pathname : null;
  });
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <div className="app">
      <header className={`header${scrolled || mobileOpen ? ' scrolled' : ''}`}>
        <div className="container header-inner">
          <Link to="/" className="brand" aria-label="Photo Platform, accueil">
            <span className="brand-mark"><Aperture aria-hidden="true" /></span>
            Photo Platform
          </Link>

          <nav className="nav" aria-label="Navigation principale">
            {main.map((item) => <NavItem key={item.to} {...item} />)}
            {admin.length > 0 && <AdminMenu items={admin} />}
          </nav>

          <div className="header-actions">
            <ThemeButton />
            {isAuthenticated ? (
              <span className="desktop-only"><UserMenu /></span>
            ) : (
              <Link to="/login" state={{ from: location }} className="btn btn-primary btn-sm desktop-only">
                <LogIn aria-hidden="true" /> Connexion
              </Link>
            )}
            <button
              type="button"
              className="icon-btn menu-toggle"
              onClick={() => setMobileOpen((open) => !open)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            >
              {mobileOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <nav className="mobile-nav" id="mobile-nav" aria-label="Navigation mobile">
          {main.map((item) => <NavItem key={item.to} {...item} />)}
          {admin.length > 0 && (
            <>
              <p className="section-title">Administration</p>
              {admin.map((item) => <NavItem key={item.to} {...item} />)}
            </>
          )}
          <p className="section-title">Compte</p>
          {isAuthenticated ? (
            <>
              <NavItem to="/account" label={`Mon compte · ${user.name}`} icon={UserRound} />
              <MobileLogout />
            </>
          ) : (
            <NavItem to="/login" label="Connexion" icon={LogIn} />
          )}
        </nav>
      )}

      <StatusBanner />

      <main className="container" id="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container">
          <span>Photo Platform</span>
          <span>Vos images restent privées : elles ne sont servies qu’après vérification de vos droits.</span>
        </div>
      </footer>
    </div>
  );
}

function MobileLogout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="nav-link"
      onClick={async () => {
        await logout();
        navigate('/');
      }}
    >
      <LogOut aria-hidden="true" /> Se déconnecter
    </button>
  );
}
