import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const KEY = 'photo-platform-theme';
const ThemeContext = createContext(null);
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function readPreference() {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function resolve(preference) {
  if (preference === 'system') return darkQuery().matches ? 'dark' : 'light';
  return preference;
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readPreference);
  const [theme, setTheme] = useState(() => resolve(readPreference()));

  useEffect(() => {
    const apply = () => {
      const next = resolve(preference);
      setTheme(next);
      document.documentElement.dataset.theme = next;
    };
    apply();
    try {
      if (preference === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, preference);
    } catch {
      // Storage can be unavailable (private browsing); the theme still applies for this visit.
    }
    if (preference !== 'system') return undefined;
    const query = darkQuery();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [preference]);

  const toggleTheme = useCallback(() => setPreference(theme === 'dark' ? 'light' : 'dark'), [theme]);
  const value = useMemo(() => ({ theme, preference, setPreference, toggleTheme }), [theme, preference, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
