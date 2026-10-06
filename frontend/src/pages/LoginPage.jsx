import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await login(form.email, form.password);
      navigate('/collections');
    } catch (err) {
      setError(err.payload?.message || 'Connexion impossible');
    }
  }

  return (
    <section>
      <h1>Connexion</h1>
      <form onSubmit={submit} className="form">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" required value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
        <label htmlFor="password">Mot de passe</label>
        <input id="password" type="password" required value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} />
        {error && <p className="error">{error}</p>}
        <button type="submit">Se connecter</button>
      </form>
    </section>
  );
}
