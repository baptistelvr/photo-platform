import { Aperture, LogIn, Mail } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Field, PasswordInput, Spinner } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const from = location.state?.from;
  const destination = from && from.pathname !== '/login' ? `${from.pathname}${from.search || ''}` : '/collections';

  if (isAuthenticated && !busy) return <Navigate to={destination} replace />;

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      toast.success(`Bienvenue ${user.name.split(' ')[0]} !`);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <span className="brand-mark"><Aperture aria-hidden="true" /></span>
        <h1>Connexion</h1>
        <p>Accédez à vos albums et à vos outils de gestion.</p>
        <form className="form-grid" onSubmit={submit}>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          <Field label="Email" htmlFor="email">
            <div className="input-group">
              <Mail aria-hidden="true" />
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="vous@exemple.fr"
              />
            </div>
          </Field>
          <Field label="Mot de passe" htmlFor="password">
            <PasswordInput id="password" value={password} onChange={setPassword} required />
          </Field>
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? <Spinner /> : <LogIn aria-hidden="true" />} Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}
