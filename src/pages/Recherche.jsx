import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, setToken } from '../api.js';
import Entete from '../components/Entete.jsx';
import { copier, formaterDate, formaterDuree } from '../utils.js';

const STATUTS_ELEVE = {
  a_faire: { libelle: 'A faire', classe: 'statut-a-faire' },
  rendu: { libelle: 'Rendu', classe: 'statut-rendu' },
  corrige: { libelle: 'Corrige', classe: 'statut-corrige' },
  manque: { libelle: 'Manque', classe: 'statut-manque' },
};

function BadgeStatut({ statut }) {
  const s = STATUTS_ELEVE[statut] || STATUTS_ELEVE.a_faire;
  return <span className={`badge-statut ${s.classe}`}>{s.libelle}</span>;
}

/** Fiche d'un eleve : classe, devoirs (rendus/pas rendus + notes) et performances. */
function FicheEleve({ fiche }) {
  const { eleve, classe, devoirs, performances } = fiche;
  const rendus = devoirs.filter((d) => d.statut === 'rendu' || d.statut === 'corrige').length;
  const notes = devoirs
    .filter((d) => d.note !== null && d.note !== undefined && d.note_max > 0)
    .map((d) => (Number(d.note) / Number(d.note_max)) * 20);
  const moyenne = notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : null;

  return (
    <>
      <div className="titre-page">
        <div>
          <h1>🎓 {eleve.nom}</h1>
          <p className="texte-doux">
            Fiche eleve · <code className="matricule-fiche">{eleve.matricule}</code>
          </p>
        </div>
        <div className="boutons-titre">
          <Link to={`/stats?eleve=${eleve.matricule}`} className="btn-secondaire btn-petit">
            📊 Statistiques
          </Link>
          <Link to={`/recherche?classe=${classe.id}`} className="btn-secondaire btn-petit">
            📚 Voir la classe
          </Link>
        </div>
      </div>

      <section className="resume-stats">
        <div className="stat-carte">
          <span>Classe</span>
          <strong className="texte">{classe.nom}</strong>
        </div>
        <div className="stat-carte">
          <span>Niveau</span>
          <strong className="texte">{classe.niveau || '—'}</strong>
        </div>
        <div className="stat-carte">
          <span>Option</span>
          <strong className="texte">{classe.option_classe || '—'}</strong>
        </div>
        <div className="stat-carte">
          <span>Devoirs rendus</span>
          <strong>
            {rendus}/{devoirs.length}
          </strong>
        </div>
        {moyenne !== null && (
          <div className="stat-carte">
            <span>Note moyenne</span>
            <strong>
              {moyenne.toFixed(1).replace('.', ',')}/20
            </strong>
          </div>
        )}
        <div className="stat-carte">
          <span>Temps passe</span>
          <strong>{formaterDuree(performances.secondes)}</strong>
        </div>
        <div className="stat-carte">
          <span>En ligne</span>
          <strong className={performances.en_ligne ? 'en-ligne' : ''}>
            {performances.en_ligne ? '● Oui' : '○ Non'}
          </strong>
        </div>
        <div className="stat-carte">
          <span>Derniere connexion</span>
          <strong className="texte">
            {performances.derniere_activite ? formaterDate(performances.derniere_activite) : '—'}
          </strong>
        </div>
      </section>

      <section className="carte-bloc">
        <div className="bloc-tete">
          <h2>Ses devoirs</h2>
          <p className="texte-doux">
            {rendus} rendu(s) sur {devoirs.length} — les devoirs non rendus apres la date de fin
            sont marques « manque ».
          </p>
        </div>
        {devoirs.length === 0 ? (
          <p className="vide">Aucun devoir pour cette classe.</p>
        ) : (
          <div className="tableau-scroll">
            <table className="tableau-stats">
              <thead>
                <tr>
                  <th>Devoir</th>
                  <th>Limite</th>
                  <th>Statut</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {devoirs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.titre}</strong>
                      <br />
                      <span className="date-contenu">{d.type === 'qcm' ? 'QCM' : 'Ouvert'}</span>
                    </td>
                    <td>{formaterDate(d.date_fin)}</td>
                    <td>
                      <BadgeStatut statut={d.statut} />
                      {d.soumis_le && (
                        <>
                          <br />
                          <span className="date-contenu">{formaterDate(d.soumis_le)}</span>
                        </>
                      )}
                    </td>
                    <td className="temps">
                      {d.note !== null && d.note !== undefined ? `${d.note}/${d.note_max}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/** Fiche d'une classe : niveau, option, effectif (liste des eleves), compteurs. */
function FicheClasse({ fiche }) {
  const { classe, eleves, nb_devoirs, nb_contenus } = fiche;

  return (
    <>
      <div className="titre-page">
        <div>
          <h1>📚 {classe.nom}</h1>
          <p className="texte-doux">
            Fiche classe · code <code className="matricule-fiche">{classe.code}</code>
          </p>
        </div>
        <div className="boutons-titre">
          <Link to="/classes" className="btn-secondaire btn-petit">
            ← Toutes les classes
          </Link>
        </div>
      </div>

      <section className="resume-stats">
        <div className="stat-carte">
          <span>Eleves</span>
          <strong>{eleves.length}</strong>
        </div>
        <div className="stat-carte">
          <span>Niveau</span>
          <strong className="texte">{classe.niveau || '—'}</strong>
        </div>
        <div className="stat-carte">
          <span>Option</span>
          <strong className="texte">{classe.option_classe || '—'}</strong>
        </div>
        <div className="stat-carte">
          <span>Devoirs en cours</span>
          <strong>{nb_devoirs}</strong>
        </div>
        <div className="stat-carte">
          <span>Contenus en cours</span>
          <strong>{nb_contenus}</strong>
        </div>
      </section>

      <section className="carte-bloc">
        <div className="bloc-tete">
          <h2>Eleves ({eleves.length})</h2>
          <p className="texte-doux">Cliquez sur « Fiche » pour voir les performances d'un eleve.</p>
        </div>
        {eleves.length === 0 ? (
          <p className="vide">Aucun eleve dans cette classe pour le moment.</p>
        ) : (
          <ul className="liste-eleves">
            {eleves.map((e) => (
              <li key={e.id}>
                <span className="pastille-initiale" aria-hidden="true">
                  {e.nom.trim().charAt(0).toUpperCase()}
                </span>
                <span className="nom-eleve">{e.nom}</span>
                <button
                  type="button"
                  className="matricule-eleve"
                  title="Cliquer pour copier le matricule"
                  onClick={async () => {
                    await copier(e.matricule);
                  }}
                >
                  {e.matricule}
                </button>
                <Link to={`/recherche?eleve=${e.matricule}`} className="btn-secondaire btn-petit">
                  Fiche
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** Page de recherche : fiche complete d'un resultat de la barre de recherche. */
export default function Recherche() {
  const [utilisateur, setUtilisateur] = useState(null);
  const [fiche, setFiche] = useState(undefined); // undefined = chargement, null = rien
  const [erreur, setErreur] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const cibleEleve = searchParams.get('eleve') || '';
  const cibleClasse = searchParams.get('classe') || '';

  function deconnecter() {
    setToken(null);
    navigate('/');
  }

  useEffect(() => {
    api('/auth/me')
      .then(async (d) => {
        if (d.utilisateur.role !== 'enseignant') {
          navigate('/espace', { replace: true });
          return;
        }
        setUtilisateur(d.utilisateur);
        setErreur('');
        setFiche(undefined);
        try {
          if (cibleEleve) {
            setFiche({ type: 'eleve', ...(await api(`/recherche/eleve/${cibleEleve}`)) });
          } else if (cibleClasse) {
            setFiche({ type: 'classe', ...(await api(`/recherche/classe/${cibleClasse}`)) });
          } else {
            setFiche(null);
          }
        } catch (e) {
          setErreur(e.message);
          setFiche(null);
        }
      })
      .catch(deconnecter);
  }, [cibleEleve, cibleClasse]);

  if (!utilisateur) {
    return (
      <div className="page-principale">
        <p className="chargement">Chargement…</p>
      </div>
    );
  }

  const sansCible = !cibleEleve && !cibleClasse;

  return (
    <div className="page-principale">
      <Entete utilisateur={utilisateur} onDeconnexion={deconnecter} />

      <main className="contenu">
        {erreur && (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        )}

        {sansCible && (
          <section className="carte-bloc">
            <p className="vide">
              Utilisez la barre de recherche en haut de page pour trouver une classe, un eleve, un
              devoir ou un contenu — chaque resultat ouvre sa fiche ici.
            </p>
          </section>
        )}

        {fiche === undefined && !sansCible && (
          <p className="chargement">Chargement de la fiche…</p>
        )}

        {fiche?.type === 'eleve' && <FicheEleve fiche={fiche} />}
        {fiche?.type === 'classe' && <FicheClasse fiche={fiche} />}
      </main>
    </div>
  );
}
