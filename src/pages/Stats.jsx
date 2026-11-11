import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, setToken } from '../api.js';
import Entete from '../components/Entete.jsx';
import { formaterDate, formaterDuree } from '../utils.js';

/** Statistiques : connexion et temps passe par chaque eleve. */
export default function Stats() {
  const [utilisateur, setUtilisateur] = useState(null);
  const [eleves, setEleves] = useState([]);
  const [classeId, setClasseId] = useState('toutes');
  const [classes, setClasses] = useState([]);
  const [erreur, setErreur] = useState('');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Eleve cible depuis la barre de recherche (?eleve=MATRICULE)
  const matriculeCible = searchParams.get('eleve') || '';

  function deconnecter() {
    setToken(null);
    navigate('/');
  }

  async function charger() {
    try {
      const donnees = await api('/presence/eleves');
      setEleves(donnees.eleves);
    } catch (err) {
      setErreur(err.message);
    }
  }

  useEffect(() => {
    api('/auth/me')
      .then(async (d) => {
        if (d.utilisateur.role !== 'enseignant') {
          navigate('/espace', { replace: true });
          return;
        }
        setUtilisateur(d.utilisateur);
        const c = await api('/classes');
        setClasses(c.classes);
        await charger();
      })
      .catch(deconnecter);
  }, []);

  // Rafraichissement automatique toutes les 30 s
  useEffect(() => {
    const t = setInterval(charger, 30000);
    return () => clearInterval(t);
  }, []);

  let filtres = eleves.filter((e) => classeId === 'toutes' || String(e.classe.id) === classeId);
  // Ciblee par la recherche : on affiche cet eleve seul, quelle que soit la classe
  const eleveCible = matriculeCible ? eleves.find((e) => e.matricule === matriculeCible) : null;
  if (eleveCible) filtres = [eleveCible];
  const totalSecondes = filtres.reduce((somme, e) => somme + e.secondes, 0);
  const enLigne = filtres.filter((e) => e.en_ligne).length;

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
            <h1>Statistiques de connexion</h1>
            <p className="texte-doux">
              Qui est connecte et combien de temps chaque eleve passe dans l'application.
            </p>
          </div>
          <div className="boutons-titre">
            {eleveCible && (
              <button
                type="button"
                className="chip-cible"
                onClick={() => setSearchParams({}, { replace: true })}
                title="Retirer ce filtre"
              >
                🎓 {eleveCible.nom} ✕
              </button>
            )}
            <label className="select-classe">
              Classe
              <select value={classeId} onChange={(e) => setClasseId(e.target.value)}>
                <option value="toutes">Toutes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn-secondaire btn-petit" onClick={charger}>
              Actualiser
            </button>
          </div>
        </div>

        {erreur && (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        )}

        <section className="resume-stats">
          <div className="stat-carte">
            <span>Eleves</span>
            <strong>{filtres.length}</strong>
          </div>
          <div className="stat-carte">
            <span>En ligne</span>
            <strong className="en-ligne">{enLigne}</strong>
          </div>
          <div className="stat-carte">
            <span>Temps total passe</span>
            <strong>{formaterDuree(totalSecondes)}</strong>
          </div>
        </section>

        <section className="carte-bloc">
          <h2>Temps passe par eleve</h2>
          {filtres.length === 0 ? (
            <p className="vide">Aucun eleve trouve.</p>
          ) : (
            <div className="tableau-scroll">
              <table className="tableau-stats">
                <thead>
                  <tr>
                    <th>Eleve</th>
                    <th>Classe</th>
                    <th>Statut</th>
                    <th>Derniere connexion</th>
                    <th>Sessions</th>
                    <th>Temps passe</th>
                  </tr>
                </thead>
                <tbody>
                  {filtres.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.nom}</strong>
                        <br />
                        <code className="matricule-tableau">{e.matricule}</code>
                      </td>
                      <td>{e.classe.nom}</td>
                      <td>
                        <span className={`statut ${e.en_ligne ? 'statut-en-ligne' : ''}`}>
                          {e.en_ligne ? '● En ligne' : '○ Hors ligne'}
                        </span>
                      </td>
                      <td>{formaterDate(e.derniere_activite)}</td>
                      <td>{e.nb_connexions}</td>
                      <td className="temps">{formaterDuree(e.secondes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
