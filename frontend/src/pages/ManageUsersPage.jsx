import { useEffect, useState } from 'react';
import { api } from '../services/api';

export function ManageUsersPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  const load = async () => {
    const response = await api.listUsers();
    setUsers(response.data || []);
  };

  useEffect(() => {
    load();
  }, []);

  async function submit(event) {
    event.preventDefault();
    await api.createUser({ ...form, role: 'user', status: 'active' });
    setForm({ name: '', email: '', password: '' });
    await load();
  }

  async function disable(userId) {
    await api.updateUser(userId, { status: 'disabled' });
    await load();
  }

  return (
    <section>
      <h1>Gestion des utilisateurs</h1>
      <form className="form" onSubmit={submit}>
        <label htmlFor="name">Nom</label>
        <input id="name" value={form.name} onChange={(e) => setForm((state) => ({ ...state, name: e.target.value }))} required />
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={form.email} onChange={(e) => setForm((state) => ({ ...state, email: e.target.value }))} required />
        <label htmlFor="password">Mot de passe</label>
        <input id="password" type="password" value={form.password} onChange={(e) => setForm((state) => ({ ...state, password: e.target.value }))} required />
        <button type="submit">Créer utilisateur</button>
      </form>

      <ul>
        {users.map((user) => (
          <li key={user.id}>
            {user.name} · {user.email} · {user.status}
            {user.status === 'active' && <button type="button" onClick={() => disable(user.id)}>Désactiver</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
