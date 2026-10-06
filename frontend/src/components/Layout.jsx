import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';

export function Layout() {
  const { user, isAuthenticated, hasPermission, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="app-shell">
      <header className="header">
        <Link to="/" className="brand">Photo Platform</Link>
        <nav className="nav" aria-label="Navigation principale">
          <NavLink to="/collections">Collections</NavLink>
          {hasPermission('UPLOAD_PHOTOS') && <NavLink to="/upload">Upload</NavLink>}
          {hasPermission('EDIT_ALBUMS') && <NavLink to="/manage/albums">Gérer albums</NavLink>}
          {hasPermission('MANAGE_USERS') && <NavLink to="/manage/users">Utilisateurs</NavLink>}
          {hasPermission('MANAGE_PERMISSIONS') && <NavLink to="/admin/logs">Logs</NavLink>}
          {!isAuthenticated ? (
            <NavLink to="/login">Connexion</NavLink>
          ) : (
            <button type="button" className="linkish" onClick={logout}>Déconnexion</button>
          )}
          <button type="button" onClick={toggleTheme} aria-label="Basculer le thème">
            {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
          </button>
        </nav>
        {isAuthenticated && <p className="user-badge">{user.name}</p>}
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
