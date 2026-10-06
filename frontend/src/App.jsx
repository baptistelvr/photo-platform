import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useAuth } from './hooks/useAuth';
import { AdminLogsPage } from './pages/AdminLogsPage';
import { CollectionDetailPage } from './pages/CollectionDetailPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { ManageAlbumsPage } from './pages/ManageAlbumsPage';
import { ManageUsersPage } from './pages/ManageUsersPage';
import { UploadPage } from './pages/UploadPage';

function ProtectedRoute({ children, permission }) {
  const { loading, isAuthenticated, hasPermission } = useAuth();
  if (loading) return <p>Chargement…</p>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (permission && !hasPermission(permission)) return <Navigate to="/collections" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/collections/:id" element={<CollectionDetailPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/upload"
          element={
            <ProtectedRoute permission="UPLOAD_PHOTOS">
              <UploadPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/manage/albums"
          element={
            <ProtectedRoute permission="EDIT_ALBUMS">
              <ManageAlbumsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/manage/users"
          element={
            <ProtectedRoute permission="MANAGE_USERS">
              <ManageUsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/logs"
          element={
            <ProtectedRoute permission="MANAGE_PERMISSIONS">
              <AdminLogsPage />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
}
