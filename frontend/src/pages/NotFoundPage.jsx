import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="not-found">
      <div className="code">404</div>
      <h1 style={{ fontSize: '1.4rem' }}>Page introuvable</h1>
      <p className="muted">Le lien est peut-être incorrect, ou la page a été déplacée.</p>
      <Link to="/" className="btn btn-primary">Retour à l’accueil</Link>
    </div>
  );
}
