import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';
import Entete from '../components/Entete.jsx';
import { copier } from '../utils.js';

const AUCUNE = '— Aucune —';
// Niveaux du secondaire en RDC (education de base + humanités) — « Autre » reste possible
const NIVEAUX = ['7eme EB', '8eme EB', '1ere', '2eme', '3eme', '4eme', 'Autre'];
// Options courantes de l'enseignement secondaire en RDC (Kongo Central comprises)
const OPTIONS_CLASSE = [
  AUCUNE,
  'Scientifique',
  'Litteraire',
  'Humanites Pedagogiques',
  'Commerciale et Gestion',
  'Education Physique',
  'Electricite',
  'Electronique',
  'Mecanique Automobile',
  'Construction Civile',
  'Informatique',
  'Secretariat Administration',
  'Autre',
];

/** "1er · Scientifique" — niveau et option d'une classe. */
function detailClasse(classe) {
  return [classe.niveau, classe.option_classe].filter(Boolean).join(' · ');
}

/** Espace enseignant : creer des classes et des eleves (avec matricules). */
export default function Classes() {
  const [utilisateur, setUtilisateur] = useState(null);
  const [classes, setClasses] = useState([]);
  const [erreur, setErreur] = useState('');

  // Formulaire de creation de classe
  const [nom, setNom] = useState('');
  const [niveau, setNiveau] = useState('');
  const [niveauAutre, setNiveauAutre] = useState('');
  const [optionChoix, setOptionChoix] = useState(AUCUNE);
  const [optionAutre, setOptionAutre] = useState('');
  const [code, setCode] = useState('');
  const [enCours, setEnCours] = useState(false);

  // Classe ouverte (detail)
  const [active, setActive] = useState(null);
  const [eleves, setEleves] = useState([]);
  const [nomEleve, setNomEleve] = useState('');
  const [dernierMatricule, setDernierMatricule] = useState(null);
  const [message, setMessage] = useState('');

  const navigate = useNavigate();

  function deconnecter() {
    setToken(null);
    navigate('/');
  }

  async function chargerClasses() {
    const donnees = await api('/classes');
    setClasses(donnees.classes);
  }

  useEffect(() => {
    api('/auth/me')
      .then(async (d) => {
        if (d.utilisateur.role !== 'enseignant') {
          navigate('/espace', { replace: true });
          return;
        }
        setUtilisateur(d.utilisateur);
        await chargerClasses();
      })
      .catch(deconnecter);
  }, []);

  async function creerClasse(e) {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      const niveauFinal = niveau === 'Autre' ? niveauAutre.trim() : niveau;
      const optionFinale =
        optionChoix === AUCUNE ? '' : optionChoix === 'Autre' ? optionAutre.trim() : optionChoix;
      await api('/classes', {
        method: 'POST',
        corps: {
          nom,
          niveau: niveauFinal,
          option_classe: optionFinale,
          code: code || undefined,
        },
      });
      setNom('');
      setNiveau('');
      setNiveauAutre('');
      setOptionChoix(AUCUNE);
      setOptionAutre('');
      setCode('');
      await chargerClasses();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  }

  async function ouvrirClasse(classe) {
    setErreur('');
    setMessage('');
    setDernierMatricule(null);
    try {
      const donnees = await api(`/classes/${classe.id}/eleves`);
      setEleves(donnees.eleves);
      setActive(donnees.classe);
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function ajouterEleve(e) {
    e.preventDefault();
    setErreur('');
    try {
      const donnees = await api(`/classes/${active.id}/eleves`, {
        method: 'POST',
        corps: { nom: nomEleve },
      });
      const nouveau = donnees.eleves[0];
      setEleves((liste) =>
        [...liste, nouveau].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
      );
      setDernierMatricule(nouveau);
      setNomEleve('');
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function supprimerEleve(eleve) {
    if (!window.confirm(`Supprimer l'eleve ${eleve.nom} ? Son matricule ne fonctionnera plus.`)) {
      return;
    }
    try {
      await api(`/classes/${active.id}/eleves/${eleve.id}`, { method: 'DELETE' });
      setEleves((liste) => liste.filter((e) => e.id !== eleve.id));
      setDernierMatricule(null);
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function supprimerClasse(classe) {
    if (
      !window.confirm(
        `Supprimer la classe "${classe.nom}" ? Tous ses eleves seront supprimes et ne pourront plus se connecter.`
      )
    ) {
      return;
    }
    try {
      await api(`/classes/${classe.id}`, { method: 'DELETE' });
      if (active && active.id === classe.id) {
        setActive(null);
        setEleves([]);
      }
      await chargerClasses();
    } catch (err) {
      setErreur(err.message);
    }
  }

  if (!utilisateur) {
    return (
      <div className="page-principale">
        <p className="chargement">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="page-principale">
      <Entete utilisateur={utilisateur} onDeconnexion={deconnecter} />

      <main className="contenu">
        <div className="titre-page">
          <div>
            <h1>{active ? active.nom : 'Mes classes'}</h1>
            <p className="texte-doux">
              {active
                ? `Code : ${active.code}${detailClasse(active) ? ` · ${detailClasse(active)}` : ''}`
                : 'Creez vos classes et ajoutez vos eleves : chacun recoit un matricule unique.'}
            </p>
          </div>
          {active && (
            <button
              type="button"
              className="btn-secondaire"
              onClick={() => {
                setActive(null);
                setEleves([]);
                setDernierMatricule(null);
                setErreur('');
              }}
            >
              ← Toutes les classes
            </button>
          )}
        </div>

        {erreur && (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        )}
        {message && <p className="succes" role="status">{message}</p>}

        {!active && (
          <>
            <section className="carte-bloc">
              <h2>Nouvelle classe</h2>
              <form onSubmit={creerClasse} className="formulaire-ligne">
                <label>
                  Nom
                  <input
                    type="text"
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    placeholder="Ex. 1ere A"
                    required
                  />
                </label>
                <label>
                  Niveau
                  <select value={niveau} onChange={(e) => setNiveau(e.target.value)} required>
                    <option value="">— Choisir —</option>
                    {NIVEAUX.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                {niveau === 'Autre' && (
                  <label>
                    Niveau (libelle)
                    <input
                      type="text"
                      value={niveauAutre}
                      onChange={(e) => setNiveauAutre(e.target.value)}
                      placeholder="Ex. 6eme"
                      required
                    />
                  </label>
                )}
                <label>
                  Option
                  <select value={optionChoix} onChange={(e) => setOptionChoix(e.target.value)}>
                    {OPTIONS_CLASSE.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                {optionChoix === 'Autre' && (
                  <label>
                    Option (libelle)
                    <input
                      type="text"
                      value={optionAutre}
                      onChange={(e) => setOptionAutre(e.target.value)}
                      placeholder="Ex. Arts"
                      required
                    />
                  </label>
                )}
                <label>
                  Code (optionnel)
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="Genere automatiquement"
                    maxLength={6}
                  />
                </label>
                <button type="submit" className="btn-principal" disabled={enCours}>
                  {enCours ? 'Creation…' : 'Creer la classe'}
                </button>
              </form>
            </section>

            <section className="grille-classes">
              {classes.length === 0 && (
                <p className="vide">Aucune classe pour le moment. Creez votre premiere classe !</p>
              )}
              {classes.map((classe) => (
                <article className="carte-classe" key={classe.id}>
                  <div className="carte-classe-tete">
                    <h2>{classe.nom}</h2>
                    <span className="badge-code">{classe.code}</span>
                  </div>
                  {detailClasse(classe) && <p className="niveau">{detailClasse(classe)}</p>}
                  <p className="nb-eleves">
                    {classe.nb_eleves} eleve{classe.nb_eleves > 1 ? 's' : ''}
                  </p>
                  <div className="actions">
                    <button type="button" className="btn-principal btn-petit" onClick={() => ouvrirClasse(classe)}>
                      Gerer
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => supprimerClasse(classe)}
                    >
                      Supprimer
                    </button>
                  </div>
                </article>
              ))}
            </section>
          </>
        )}

        {active && (
          <>
            <section className="carte-bloc">
              <h2>Ajouter un eleve</h2>
              <form onSubmit={ajouterEleve} className="formulaire-ligne">
                <label>
                  Nom de l'eleve
                  <input
                    type="text"
                    value={nomEleve}
                    onChange={(e) => setNomEleve(e.target.value)}
                    placeholder="Ex. Kouassi Aya"
                    required
                  />
                </label>
                <button type="submit" className="btn-principal">
                  Ajouter
                </button>
              </form>

              {dernierMatricule && (
                <div className="encart-matricule">
                  <span>Eleve ajoute — matricule :</span>
                  <code
                    onClick={async () => {
                      await copier(dernierMatricule.matricule);
                    }}
                    title="Cliquer pour copier"
                  >
                    {dernierMatricule.matricule}
                  </code>
                  <button
                    type="button"
                    className="btn-secondaire btn-petit"
                    onClick={async () => {
                      await copier(dernierMatricule.matricule);
                    }}
                  >
                    Copier
                  </button>
                </div>
              )}
            </section>

            <section className="carte-bloc">
              <h2>
                Eleves ({eleves.length})
              </h2>
              {eleves.length === 0 ? (
                <p className="vide">Aucun eleve pour le moment.</p>
              ) : (
                <ul className="liste-eleves">
                  {eleves.map((eleve) => (
                    <li key={eleve.id}>
                      <span className="nom-eleve">{eleve.nom}</span>
                      <button
                        type="button"
                        className="matricule-eleve"
                        title="Cliquer pour copier le matricule"
                        onClick={async () => {
                          await copier(eleve.matricule);
                        }}
                      >
                        {eleve.matricule}
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() => supprimerEleve(eleve)}
                      >
                        Supprimer
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
