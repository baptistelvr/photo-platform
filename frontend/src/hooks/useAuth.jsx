import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, onUnauthorized } from '../lib/api';
import { useToast } from './useToast';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Set when the API cannot be reached or reports a configuration problem.
  const [serverError, setServerError] = useState(null);
  const userRef = useRef(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.me());
      setServerError(null);
    } catch (error) {
      setUser(null);
      setServerError(error.status === 0 || error.status >= 500 ? error : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => onUnauthorized(() => {
    if (userRef.current) toast.info('Votre session a expiré, reconnectez-vous.');
    setUser(null);
  }), [toast]);

  const value = useMemo(() => {
    const hasPermission = (permission) => Boolean(user && (user.role === 'main_admin' || user.permissions?.includes(permission)));
    return {
      user,
      loading,
      serverError,
      isAuthenticated: Boolean(user),
      hasPermission,
      hasAnyPermission: (permissions) => permissions.some(hasPermission),
      refresh,
      login: async (email, password) => {
        const signedIn = await api.login(email, password);
        setUser(signedIn);
        setServerError(null);
        return signedIn;
      },
      logout: async () => {
        await api.logout().catch(() => {});
        setUser(null);
      },
    };
  }, [user, loading, serverError, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
