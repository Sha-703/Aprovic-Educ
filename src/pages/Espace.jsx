import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';
import Entete from '../components/Entete.jsx';
import { demarrerPresence } from '../presence.js';

/** Carte "Ma classe" de l'eleve : classe, enseignant, camarades. */
function CarteClasse() {
  const [info, setInfo] = useState(undefined);

  useEffect(() => {
    api('/eleve/ma-classe')
      .then(setInfo)
      .catch(() => setInfo({ classe: null, enseignant: null, camarades: [] }));
  }, []);

  if (info === undefined) {
    return <div className="module">Chargement de la classe…</div>;
  }

  if (!info.classe) {
    return (
      <article className="module">
        <div className="module-tete">
          <h2>Ma classe</h2>
        </div>
        <p>Aucune classe attribuee pour le moment. Contactez votre enseignant.</p>
      </article>
    );
  }

  // Sous-titre : affiche niveau/option seulement s'ils ne sont pas deja dans le nom.
  const sousTitre = [info.classe.niveau, info.classe.option_classe]
    .filter((p) => p && !String(info.classe.nom).includes(p))
    .join(' · ');

  return (
    <article className="module module-classe">
      <div className="module-tete">
        <h2>🎓 {info.classe.nom}</h2>
        <span className="badge-code">{info.classe.code}</span>
      </div>
      {sousTitre && <p className="niveau">{sousTitre}</p>}
      <ul className="details-classe">
        <li>
          <span>Enseignant</span> {info.enseignant || '—'}
        </li>
        <li>
          <span>Matricule</span> <code>{info.matricule}</code>
        </li>
        <li>
          <span>Camarades</span> {info.camarades.length}
        </li>
      </ul>
      {info.camarades.length > 0 && (
        <details className="camarades">
          <summary>Voir mes camarades ({info.camarades.length})</summary>
          <ul>
            {info.camarades.map((nom) => (
              <li key={nom}>{nom}</li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

/** Espace personnel : recoit l'eleve ou l'enseignant apres connexion. */
export default function Espace() {
  const [utilisateur, setUtilisateur] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api('/auth/me')
      .then((d) => setUtilisateur(d.utilisateur))
      .catch(deconnecter);
    demarrerPresence();
  }, []);

  function deconnecter() {
    setToken(null);
    navigate('/');
  }

  if (!utilisateur) {
    return (
      <div className="page-principale">
        <p className="chargement">Chargement…</p>
      </div>
    );
  }

  const estEnseignant = utilisateur.role === 'enseignant';

  return (
    <div className="page-principale">
      <Entete utilisateur={utilisateur} onDeconnexion={deconnecter} />

      <main className="contenu">
        <section className="bienvenue">
          <div>
            <h1>Bonjour, {utilisateur.nom.split(' ')[0]} 👋</h1>
            <p className="texte-doux">
              {estEnseignant
                ? 'Votre espace enseignant : classes, contenus et devoirs.'
                : 'Votre espace eleve : contenus a lire et devoirs a rendre.'}
            </p>
          </div>
          <div className="badge-matricule">
            <span>Votre matricule</span>
            <strong>{utilisateur.matricule}</strong>
          </div>
        </section>

        {estEnseignant && (
          <section className="grille-modules">
            <article className="module module-lien">
              <div className="module-tete">
                <h2>📚 Mes classes</h2>
              </div>
              <p>Creez des classes et ajoutez des eleves (avec matricules).</p>
              <Link to="/classes" className="btn-principal btn-petit lien-bloc">
                Ouvrir
              </Link>
            </article>
            <article className="module module-lien">
              <div className="module-tete">
                <h2>📄 Mes contenus</h2>
              </div>
              <p>Textes, videos, fichiers et PDF pour vos classes.</p>
              <Link to="/contenus" className="btn-principal btn-petit lien-bloc">
                Ouvrir
              </Link>
            </article>
            <article className="module module-lien">
              <div className="module-tete">
                <h2>📊 Statistiques</h2>
              </div>
              <p>Connexions et temps passe par chaque eleve.</p>
              <Link to="/stats" className="btn-principal btn-petit lien-bloc">
                Ouvrir
              </Link>
            </article>
            <article className="module module-lien">
              <div className="module-tete">
                <h2>📝 Mes devoirs</h2>
              </div>
              <p>QCM auto-corriges et devoirs ouverts a corriger.</p>
              <Link to="/devoirs" className="btn-principal btn-petit lien-bloc">
                Ouvrir
              </Link>
            </article>
          </section>
        )}

        {!estEnseignant && (
          <section className="grille-modules">
            <CarteClasse />
            <article className="module module-lien">
              <div className="module-tete">
                <h2>📄 Mes contenus</h2>
              </div>
              <p>Retrouvez ici les texts, videos et documents de votre classe.</p>
              <Link to="/mes-contenus" className="btn-principal btn-petit lien-bloc">
                Ouvrir
              </Link>
            </article>
            <article className="module module-lien">
              <div className="module-tete">
                <h2>📝 Mes devoirs</h2>
              </div>
              <p>QCM et devoirs ouverts a rendre avant la date de fin.</p>
              <Link to="/mes-devoirs" className="btn-principal btn-petit lien-bloc">
                Ouvrir
              </Link>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}
