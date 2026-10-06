import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <section className="hero">
      <h1>Publiez et gérez vos photos en toute sécurité</h1>
      <p>Une expérience moderne, responsive et orientée image pour vos collections publiques et protégées.</p>
      <Link className="button" to="/collections">Voir les collections</Link>
    </section>
  );
}
