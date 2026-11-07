import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';
import Entete from '../components/Entete.jsx';
import { formaterDate } from '../utils.js';

function BadgeStatut({ statut }) {
  if (statut === 'rendu') return <span className="badge-statut statut-rendu">Rendu</span>;
  if (statut === 'corrige') return <span className="badge-statut statut-corrige">Corrige</span>;
  if (statut === 'manque') return <span className="badge-statut statut-manque">Manque</span>;
  return <span className="badge-statut statut-a-faire">A faire</span>;
}

/** Espace eleve : devoirs QCM et ouverts a rendre avant la date de fin. */
export default function DevoirsEleve() {
  const [utilisateur, setUtilisateur] = useState(null);
  const [devoirs, setDevoirs] = useState([]);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  const [vue, setVue] = useState('liste'); // liste | repondre | resultat
  const [cible, setCible] = useState(null);
  const [choix, setChoix] = useState([]);
  const [texte, setTexte] = useState('');
  const [resultat, setResultat] = useState(null);

  const navigate = useNavigate();

  function deconnecter() {
    setToken(null);
    navigate('/');
  }

  async function charger() {
    const d = await api('/eleve/devoirs');
    setDevoirs(d.devoirs);
  }

  useEffect(() => {
    api('/auth/me')
      .then((d) => setUtilisateur(d.utilisateur))
      .catch(deconnecter);
    charger().catch((e) => setErreur(e.message));
  }, []);

  function repondre(devoir) {
    setErreur('');
    setMessage('');
    setCible(devoir);
    setChoix(devoir.questions.map(() => null));
    setTexte('');
    setVue('repondre');
  }

  function voirReponse(devoir) {
    const reponses = JSON.parse(devoir.mon_rendu?.reponse || '[]');
    const correction = devoir.questions.map((q, i) => {
      const choisi = Number(reponses[i]);
      return {
        enonce: q.enonce,
        choix: q.choix,
        bonne_reponse: q.bonne_reponse,
        reponse_choisie: Number.isInteger(choisi) ? choisi : null,
        juste: choisi === q.bonne_reponse,
      };
    });
    const bonnes = correction.filter((c) => c.juste).length;
    const note = devoir.mon_rendu?.note ?? 0;
    setResultat({
      titre: devoir.titre,
      note,
      note_max: devoir.note_max,
      bonnes,
      total: correction.length,
      reussi: note >= devoir.note_max / 2,
      correction,
      historique: true,
    });
    setVue('resultat');
  }

  async function rendreQcm() {
    setErreur('');
    if (choix.some((c) => c === null || c === undefined)) {
      setErreur('Repondez a toutes les questions avant de rendre le devoir.');
      return;
    }
    try {
      const d = await api(`/eleve/devoirs/${cible.id}/rendre`, {
        method: 'POST',
        corps: { reponse: choix },
      });
      setResultat({ titre: cible.titre, ...d.resultat, correction: d.correction });
      setVue('resultat');
      await charger();
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function rendreTexte() {
    setErreur('');
    try {
      const d = await api(`/eleve/devoirs/${cible.id}/rendre`, {
        method: 'POST',
        corps: { reponse: texte },
      });
      setMessage(d.message);
      setTexte('');
      setVue('liste');
      await charger();
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
            <h1>
              {vue === 'liste'
                ? 'Mes devoirs'
                : vue === 'repondre'
                  ? cible?.titre
                  : 'Resultat'}
            </h1>
            <p className="texte-doux">
              {vue === 'liste'
                ? 'Rendez vos devoirs avant la date de fin : apres, ils sont retires.'
                : vue === 'repondre'
                  ? `A rendre avant le ${formaterDate(cible?.date_fin)}`
                  : resultat?.titre}
            </p>
          </div>
          {vue !== 'liste' && (
            <button
              type="button"
              className="btn-secondaire btn-petit"
              onClick={() => {
                setVue('liste');
                setErreur('');
                setMessage('');
              }}
            >
              ← Mes devoirs
            </button>
          )}
        </div>

        {erreur && (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        )}
        {message && (
          <p className="succes" role="status">
            {message}
          </p>
        )}

        {/* ============ LISTE ============ */}
        {vue === 'liste' && (
          <section className="carte-bloc">
            <h2>En cours ({devoirs.length})</h2>
            {devoirs.length === 0 ? (
              <p className="vide">Aucun devoir en cours. Profitez-en pour relire les contenus !</p>
            ) : (
              <ul className="liste-contenus">
                {devoirs.map((d) => (
                  <li key={d.id} className="item-contenu">
                    <div className="item-contenu-tete">
                      <span className={`pastille pastille-${d.type === 'qcm' ? 'texte' : 'video'}`}>
                        {d.type === 'qcm' ? 'QCM' : 'Ouvert'}
                      </span>
                      <strong>{d.titre}</strong>
                      <span className="tag-date">Avant le {formaterDate(d.date_fin)}</span>
                      <BadgeStatut statut={d.statut} />
                    </div>

                    {d.consigne && <p className="texte-doux">{d.consigne}</p>}

                    {d.statut === 'a_faire' && (
                      <div className="actions">
                        <button
                          type="button"
                          className="btn-principal btn-petit"
                          onClick={() => repondre(d)}
                        >
                          {d.type === 'qcm' ? 'Repondre' : 'Rendre mon devoir'}
                        </button>
                      </div>
                    )}

                    {d.statut === 'rendu' && d.type === 'qcm' && (
                      <div className="actions">
                        <span className="note-eleve">
                          Note : {d.mon_rendu.note}/{d.note_max}
                          {(d.mon_rendu.note ?? 0) >= d.note_max / 2 ? ' ✔ Reussi' : ' ✘ A ameliorer'}
                        </span>
                        <button
                          type="button"
                          className="btn-secondaire btn-petit"
                          onClick={() => voirReponse(d)}
                        >
                          Voir ma reponse
                        </button>
                      </div>
                    )}

                    {d.statut === 'rendu' && d.type === 'ouvert' && (
                      <div className="actions">
                        <span className="note-eleve">
                          Envoye le {formaterDate(d.mon_rendu.soumis_le)} — en attente de correction
                        </span>
                      </div>
                    )}

                    {d.statut === 'corrige' && (
                      <div className="actions">
                        <span className="note-eleve note-corrige">
                          Note : {d.mon_rendu.note}/{d.note_max}
                        </span>
                        {d.mon_rendu.commentaire && (
                          <span className="commentaire-eleve">
                            « {d.mon_rendu.commentaire} »
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ============ REPONDRE ============ */}
        {vue === 'repondre' && cible && (
          <section className="carte-bloc">
            <h2>{cible.type === 'qcm' ? 'Questions' : 'Votre reponse'}</h2>

            {cible.type === 'qcm' ? (
              <div className="editeur-questions">
                {cible.questions.map((q, i) => (
                  <fieldset className="question-bloc" key={q.id ?? i}>
                    <legend>Question {i + 1}</legend>
                    <p className="enonce-question">{q.enonce}</p>
                    <div className="choix-liste">
                      {q.choix.map((c, j) => (
                        <label className="choix-eleve" key={j}>
                          <input
                            type="radio"
                            name={`q-${i}`}
                            checked={choix[i] === j}
                            onChange={() =>
                              setChoix((chs) => chs.map((v, k) => (k === i ? j : v)))
                            }
                          />
                          <span>{c}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
                <div className="actions">
                  <button type="button" className="btn-principal" onClick={rendreQcm}>
                    Rendre le devoir
                  </button>
                </div>
              </div>
            ) : (
              <div className="formulaire-contenu">
                <label>
                  Votre reponse redigee
                  <textarea
                    rows="10"
                    value={texte}
                    onChange={(e) => setTexte(e.target.value)}
                    placeholder="Ecrivez ici votre reponse…"
                  />
                </label>
                <button type="button" className="btn-principal" onClick={rendreTexte}>
                  Soumettre mon devoir
                </button>
              </div>
            )}
          </section>
        )}

        {/* ============ RESULTAT ============ */}
        {vue === 'resultat' && resultat && (
          <section className="carte-bloc">
            <div className={`encart-resultat ${resultat.reussi ? 'resultat-ok' : 'resultat-ko'}`}>
              <span className="grosse-note">
                {resultat.note}/{resultat.note_max}
              </span>
              <span className="verdict">
                {resultat.reussi ? '✔ Reussi' : '✘ Echoue'}
                {resultat.historique ? '' : ' — devoir rendu'}
              </span>
              <span className="detail-note">
                {resultat.bonnes} bonne(s) reponse(s) sur {resultat.total}
              </span>
            </div>

            <ol className="correction-eleve">
              {resultat.correction.map((c, i) => (
                <li key={i} className={c.juste ? 'juste' : 'faux'}>
                  <strong>{c.enonce}</strong>
                  <ul>
                    {c.choix.map((choixTexte, j) => (
                      <li
                        key={j}
                        className={
                          j === c.bonne_reponse
                            ? 'bonne-reponse'
                            : j === c.reponse_choisie
                              ? 'mauvaise-reponse'
                              : ''
                        }
                      >
                        {j === c.bonne_reponse ? '✔ ' : j === c.reponse_choisie ? '✘ ' : '· '}
                        {choixTexte}
                        {j === c.reponse_choisie && j !== c.bonne_reponse && ' (votre reponse)'}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>

            <div className="actions">
              <button
                type="button"
                className="btn-principal"
                onClick={() => setVue('liste')}
              >
                Retour a mes devoirs
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
