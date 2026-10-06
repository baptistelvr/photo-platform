import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me()
      .then((result) => setUser(result.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      hasPermission: (permission) => user?.role === 'main_admin' || user?.permissions?.includes(permission),
      login: async (email, password) => {
        const response = await api.login(email, password);
        setUser(response.data);
      },
      logout: async () => {
        await api.logout();
        setUser(null);
      },
      refresh: async () => {
        const response = await api.me();
        setUser(response.data);
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
