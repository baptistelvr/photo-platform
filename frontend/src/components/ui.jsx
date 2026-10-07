import { ArrowLeft, Eye, EyeOff, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { avatarColor, initials } from '../lib/format';

export function PageHeader({ title, subtitle, back, actions, children }) {
  return (
    <header className="page-header">
      <div>
        {back && (
          <Link to={back.to} className="eyebrow">
            <ArrowLeft aria-hidden="true" />
            {back.label}
          </Link>
        )}
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty-state">
      {Icon && <div className="empty-icon"><Icon aria-hidden="true" /></div>}
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function PageLoader({ label = 'Chargement…' }) {
  return (
    <div className="page-loader" role="status">
      <LoaderCircle className="spin" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><TriangleAlert aria-hidden="true" /></div>
      <h2>Chargement impossible</h2>
      <p>{error?.message || 'Une erreur inattendue est survenue.'}</p>
      {onRetry && <button type="button" className="btn" onClick={onRetry}>Réessayer</button>}
    </div>
  );
}

export function Spinner() {
  return <LoaderCircle className="spin" aria-hidden="true" />;
}

export function Avatar({ name, size }) {
  return (
    <span className={`avatar${size === 'lg' ? ' lg' : ''}`} style={{ '--avatar-bg': avatarColor(name) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Field({ label, hint, error, htmlFor, children }) {
  return (
    <div className="field">
      {label && <label className="field-label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <p className="field-error">{error}</p> : hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function PasswordInput({ id, value, onChange, autoComplete = 'current-password', ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="input-group">
      <input
        id={id}
        className="input"
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        style={{ paddingLeft: 12 }}
        {...props}
      />
      <button
        type="button"
        className="icon-btn sm input-action"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      >
        {visible ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}
