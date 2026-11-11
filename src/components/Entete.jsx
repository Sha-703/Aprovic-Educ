import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formaterDate } from '../utils.js';

const GROUPES_RECHERCHE = [
  { cle: 'eleves', titre: 'Eleves', icone: '🎓' },
  { cle: 'classes', titre: 'Classes', icone: '📚' },
  { cle: 'devoirs', titre: 'Devoirs', icone: '📝' },
  { cle: 'contenus', titre: 'Contenus', icone: '📄' },
];

/** Barre de recherche globale : classes, eleves, devoirs, contenus. */
function BarreRecherche({ role }) {
  const [q, setQ] = useState('');
  const [resultats, setResultats] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const minuterie = useRef(null);
  const navigate = useNavigate();

  // Recherche debouncee : lancee 300 ms apres la frappe (des que2 caracteres)
  useEffect(() => {
    clearTimeout(minuterie.current);
    const terme = q.trim();
    if (terme.length < 2) {
      setResultats(null);
      setEnCours(false);
      return;
    }
    setEnCours(true);
    minuterie.current = setTimeout(() => {
      api(`/recherche?q=${encodeURIComponent(terme)}`)
        .then((d) => {
          setResultats(d);
          setOuvert(true);
        })
        .catch(() => {
          setResultats(null);
          setOuvert(false);
        })
        .finally(() => setEnCours(false));
    }, 300);
    return () => clearTimeout(minuterie.current);
  }, [q]);

  // Fermeture par la touche Echap
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        setOuvert(false);
        setQ('');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function ouvrir(type, item) {
    setOuvert(false);
    setQ('');
    if (type === 'classe') navigate(`/classes?classe=${item.code}`);
    else if (type === 'eleve') navigate(`/stats?eleve=${item.matricule}`);
    else if (type === 'devoir') {
      navigate(
        role === 'enseignant'
          ? `/devoirs?devoir=${item.id}&classe=${item.classe_id}`
          : `/mes-devoirs?devoir=${item.id}`
      );
    } else if (type === 'contenu') {
      navigate(role === 'enseignant' ? '/contenus' : '/mes-contenus');
    }
  }

  function secondLigne(type, item) {
    if (type === 'classe') {
      const details = [item.niveau, item.option_classe].filter(Boolean).join(' · ');
      return `${item.code}${details ? ` · ${details}` : ''}`;
    }
    if (type === 'eleve') return `${item.matricule} · ${item.classe_nom}`;
    if (type === 'devoir') {
      return `${item.classe_nom} · avant le ${formaterDate(item.date_fin)}`;
    }
    return `${item.type} · ${item.classe_nom}`;
  }

  const total = resultats
    ? GROUPES_RECHERCHE.reduce((n, g) => n + (resultats[g.cle]?.length || 0), 0)
    : 0;

  return (
    <div
      className="zone-recherche"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOuvert(false);
      }}
    >
      <span className="loupe" aria-hidden="true">
        🔍
      </span>
      <input
        type="search"
        className="recherche-champ"
        placeholder="Rechercher : eleve, classe, devoir…"
        aria-label="Rechercher dans l'application"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => {
          if (resultats) setOuvert(true);
        }}
      />
      {ouvert && resultats && (
        <div className="recherche-resultats">
          {enCours && <p className="recherche-message">Recherche…</p>}
          {!enCours && total === 0 && (
            <p className="recherche-message">Aucun resultat pour « {q.trim()} ».</p>
          )}
          {!enCours &&
            total > 0 &&
            GROUPES_RECHERCHE.filter((g) => resultats[g.cle]?.length).map((g) => (
              <div className="recherche-groupe" key={g.cle}>
                <span className="recherche-titre-groupe">
                  {g.icone} {g.titre}
                </span>
                {resultats[g.cle].map((item) => (
                  <button
                    key={`${g.cle}-${item.id}`}
                    type="button"
                    className="recherche-item"
                    onClick={() => ouvrir(g.cle, item)}
                  >
                    <strong>{g.cle === 'eleves' || g.cle === 'classes' ? item.nom : item.titre}</strong>
                    <span>{secondLigne(g.cle, item)}</span>
                  </button>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

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

      <BarreRecherche role={utilisateur.role} />

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
