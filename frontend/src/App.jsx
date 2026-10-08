import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PageLoader } from './components/ui';
import { useAuth } from './hooks/useAuth';
import { AlbumPage } from './pages/AlbumPage';
import { CollectionPage } from './pages/CollectionPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';

// Pages only some users need are split into their own chunks.
const named = (loader, name) => lazy(() => loader().then((module) => ({ default: module[name] })));
const UploadPage = named(() => import('./pages/UploadPage'), 'UploadPage');
const AccountPage = named(() => import('./pages/AccountPage'), 'AccountPage');
const ManageAlbumsPage = named(() => import('./pages/ManageAlbumsPage'), 'ManageAlbumsPage');
const ManageUsersPage = named(() => import('./pages/ManageUsersPage'), 'ManageUsersPage');
const AdminLogsPage = named(() => import('./pages/AdminLogsPage'), 'AdminLogsPage');
const StoragePage = named(() => import('./pages/StoragePage'), 'StoragePage');

function Protected({ children, anyOf }) {
  const { loading, isAuthenticated, hasAnyPermission } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  if (anyOf && !hasAnyPermission(anyOf)) return <Navigate to="/collections" replace />;
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="collections/:id" element={<CollectionPage />} />
        <Route path="albums/:id" element={<AlbumPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="account" element={<Protected><AccountPage /></Protected>} />
        <Route path="upload" element={<Protected anyOf={['UPLOAD_PHOTOS']}><UploadPage /></Protected>} />
        <Route
          path="manage/albums"
          element={<Protected anyOf={['CREATE_ALBUMS', 'EDIT_ALBUMS', 'DELETE_ALBUMS']}><ManageAlbumsPage /></Protected>}
        />
        <Route path="manage/users" element={<Protected anyOf={['MANAGE_USERS']}><ManageUsersPage /></Protected>} />
        <Route path="admin/logs" element={<Protected anyOf={['MANAGE_PERMISSIONS']}><AdminLogsPage /></Protected>} />
        <Route path="admin/storage" element={<Protected anyOf={['MANAGE_PERMISSIONS']}><StoragePage /></Protected>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
