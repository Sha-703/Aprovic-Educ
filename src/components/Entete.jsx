import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * En-tete de l'application avec navbar de navigation.
 * Le logo et "Accueil" ramenent au tableau de bord.
 * L'icone (initiales) en haut a droite s'ouvre sur les infos du compte.
 */
export default function Entete({ utilisateur, onDeconnexion }) {
  const [ouvert, setOuvert] = useState(false);
  const [menuMobile, setMenuMobile] = useState(false);
  const location = useLocation();

  const initiales = utilisateur.nom
    .trim()
    .split(/\s+/)
    .map((mot) => mot[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const role = utilisateur.role === 'enseignant' ? 'Enseignant' : 'Eleve';

  const liens =
    utilisateur.role === 'enseignant'
      ? [
          { to: '/espace', label: 'Accueil' },
          { to: '/classes', label: 'Mes classes' },
          { to: '/contenus', label: 'Mes contenus' },
          { to: '/devoirs', label: 'Devoirs' },
          { to: '/stats', label: 'Statistiques' },
        ]
      : [
          { to: '/espace', label: 'Accueil' },
          { to: '/mes-contenus', label: 'Mes contenus' },
          { to: '/mes-devoirs', label: 'Mes devoirs' },
        ];

  return (
    <header className="entete">
      <div className="entete-gauche">
        <Link to="/espace" className="logo-lien" title="Retour au tableau de bord">
          <img src="/icon.svg" alt="" width="36" height="36" />
          <strong>Aprovic Educ</strong>
        </Link>
      </div>

      <nav
        className={`navbar${menuMobile ? ' navbar-ouverte' : ''}`}
        aria-label="Navigation principale"
      >
        {liens.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={`lien-nav${location.pathname === l.to ? ' actif' : ''}`}
            onClick={() => setMenuMobile(false)}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="entete-droite">
        <button
          type="button"
          className="btn-burger"
          onClick={() => setMenuMobile((v) => !v)}
          aria-label="Ouvrir le menu"
          aria-expanded={menuMobile}
        >
          ☰
        </button>

        <div className="zone-compte">
          <button
            type="button"
            className="avatar"
            onClick={() => setOuvert((v) => !v)}
            aria-expanded={ouvert}
            aria-label="Voir les infos du compte"
            title="Infos du compte"
          >
            {initiales}
          </button>

          {ouvert && (
            <>
              <div className="voile" onClick={() => setOuvert(false)} />
              <div className="carte-compte" role="dialog" aria-label="Infos du compte">
                <div className="carte-compte-tete">
                  <span className="avatar avatar-gros">{initiales}</span>
                  <div className="carte-compte-titre">
                    <strong>{utilisateur.nom}</strong>
                    <span>{role}</span>
                  </div>
                </div>

                <dl className="infos-compte">
                  <div>
                    <dt>Nom</dt>
                    <dd>{utilisateur.nom}</dd>
                  </div>
                  <div>
                    <dt>Role</dt>
                    <dd>{role}</dd>
                  </div>
                  <div>
                    <dt>Matricule</dt>
                    <dd>
                      <code>{utilisateur.matricule}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>E-mail</dt>
                    <dd>{utilisateur.email || '—'}</dd>
                  </div>
                  {utilisateur.ecole && (
                    <div>
                      <dt>Ecole</dt>
                      <dd>{utilisateur.ecole}</dd>
                    </div>
                  )}
                </dl>

                <Link to="/reglages" className="lien-menu-compte" onClick={() => setOuvert(false)}>
                  ⚙ Reglages
                </Link>

                <button
                  type="button"
                  className="btn-deconnexion"
                  onClick={() => {
                    setOuvert(false);
                    onDeconnexion();
                  }}
                >
                  Deconnexion
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
