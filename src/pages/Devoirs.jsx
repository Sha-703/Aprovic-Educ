import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, setToken } from '../api.js';
import Entete from '../components/Entete.jsx';
import { formaterDate } from '../utils.js';

const STATUTS = {
  a_faire: { libelle: 'A faire', classe: 'statut-a-faire' },
  rendu: { libelle: 'Rendu', classe: 'statut-rendu' },
  corrige: { libelle: 'Corrige', classe: 'statut-corrige' },
  manque: { libelle: 'Manque', classe: 'statut-manque' },
};

function BadgeStatut({ statut }) {
  const s = STATUTS[statut] || STATUTS.a_faire;
  return <span className={`badge-statut ${s.classe}`}>{s.libelle}</span>;
}

/** Espace enseignant : creer des devoirs (QCM / ouverts) avec date de fin. */
export default function Devoirs() {
  const [utilisateur, setUtilisateur] = useState(null);
  const [classes, setClasses] = useState([]);
  const [classeId, setClasseId] = useState('');
  const [devoirs, setDevoirs] = useState([]);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  // Formulaire
  const [titre, setTitre] = useState('');
  const [type, setType] = useState('qcm');
  const [consigne, setConsigne] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [noteMax, setNoteMax] = useState('20');
  const [questions, setQuestions] = useState([{ enonce: '', choix: ['', ''], bonne: 0 }]);
  const [enCours, setEnCours] = useState(false);

  // Suivi des rendus
  const [actif, setActif] = useState(null);
  const [rendus, setRendus] = useState([]);
  const [questionsDetail, setQuestionsDetail] = useState([]);
  const [formCorr, setFormCorr] = useState({});

  // Republication
  const [republie, setRepublie] = useState(null);
  const [dateRepub, setDateRepub] = useState('');

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  function deconnecter() {
    setToken(null);
    navigate('/');
  }

  async function chargerDevoirs() {
    if (!classeId) {
      setDevoirs([]);
      return null;
    }
    const d = await api(`/classes/${classeId}/devoirs`);
    setDevoirs(d.devoirs);
    return d.devoirs;
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
        // Classe demandee par la barre de recherche (?classe=ID), sinon la premiere
        const classeDemandee = searchParams.get('classe');
        const premiere =
          (classeDemandee && c.classes.find((x) => String(x.id) === classeDemandee)) ||
          c.classes[0];
        if (premiere) setClasseId(String(premiere.id));
      })
      .catch(deconnecter);
  }, []);

  useEffect(() => {
    const idCible = searchParams.get('devoir');
    chargerDevoirs()
      .then((liste) => {
        setActif(null);
        if (!idCible || !liste) return;
        const cible = liste.find((d) => String(d.id) === idCible);
        setSearchParams({}, { replace: true }); // URL nettoyee
        if (cible) ouvrirSuivi(cible).catch(() => {});
      })
      .catch(() => {});
  }, [classeId]);

  /* ---------- Editeur de questions ---------- */
  function majQuestion(i, champ, valeur) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, [champ]: valeur } : q)));
  }
  function majChoix(i, j, valeur) {
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx === i ? { ...q, choix: q.choix.map((c, k) => (k === j ? valeur : c)) } : q
      )
    );
  }
  function ajouterChoix(i) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, choix: [...q.choix, ''] } : q)));
  }
  function retirerChoix(i, j) {
    setQuestions((qs) =>
      qs.map((q, idx) => {
        if (idx !== i) return q;
        const choix = q.choix.filter((_, k) => k !== j);
        let bonne = q.bonne;
        if (j === q.bonne) bonne = 0;
        else if (j < q.bonne) bonne = q.bonne - 1;
        return { ...q, choix, bonne };
      })
    );
  }
  function ajouterQuestion() {
    setQuestions((qs) => [...qs, { enonce: '', choix: ['', ''], bonne: 0 }]);
  }
  function retirerQuestion(i) {
    setQuestions((qs) => (qs.length > 1 ? qs.filter((_, k) => k !== i) : qs));
  }

  /* ---------- Creation ---------- */
  async function creerDevoir(e) {
    e.preventDefault();
    setErreur('');
    setMessage('');

    if (!dateFin) {
      setErreur('Indiquez la date de fin du devoir.');
      return;
    }
    if (type === 'qcm') {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const pleins = q.choix.map((c) => c.trim()).filter(Boolean);
        if (q.enonce.trim().length < 2) {
          setErreur(`Question ${i + 1} : enonce manquant.`);
          return;
        }
        if (pleins.length < 2) {
          setErreur(`Question ${i + 1} : au moins 2 choix.`);
          return;
        }
        if (!q.choix[q.bonne] || !q.choix[q.bonne].trim()) {
          setErreur(`Question ${i + 1} : choisissez la bonne reponse.`);
          return;
        }
      }
    }

    setEnCours(true);
    try {
      await api(`/classes/${classeId}/devoirs`, {
        method: 'POST',
        corps: {
          titre,
          type,
          consigne,
          date_fin: new Date(dateFin).toISOString(),
          note_max: Number(noteMax) > 0 ? Number(noteMax) : 20,
          questions:
            type === 'qcm'
              ? questions.map((q) => ({
                  enonce: q.enonce,
                  choix: q.choix,
                  bonne_reponse: q.bonne,
                }))
              : undefined,
        },
      });
      setTitre('');
      setConsigne('');
      setDateFin('');
      setQuestions([{ enonce: '', choix: ['', ''], bonne: 0 }]);
      setMessage(`Devoir "${titre}" cree.`);
      await chargerDevoirs();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  }

  /* ---------- Suivi / correction ---------- */
  async function ouvrirSuivi(devoir) {
    setErreur('');
    try {
      const d = await api(`/classes/${classeId}/devoirs/${devoir.id}/rendus`);
      setActif(d.devoir);
      setRendus(d.rendus);
      setQuestionsDetail(d.questions);
      setFormCorr({});
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function corriger(rendu) {
    const f = formCorr[rendu.rendu_id] || {};
    if (f.note === undefined || f.note === '') {
      setErreur('Entrez une note pour corriger.');
      return;
    }
    setErreur('');
    try {
      await api(`/rendus/${rendu.rendu_id}/corriger`, {
        method: 'PUT',
        corps: { note: Number(f.note), commentaire: f.commentaire || '' },
      });
      await ouvrirSuivi(actif);
      setMessage(`Devoir de ${rendu.eleve.nom} corrige.`);
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function republier(devoir) {
    if (!dateRepub) {
      setErreur('Choisissez une nouvelle date de fin.');
      return;
    }
    setErreur('');
    try {
      await api(`/classes/${classeId}/devoirs/${devoir.id}`, {
        method: 'PUT',
        corps: { date_fin: new Date(dateRepub).toISOString() },
      });
      setRepublie(null);
      setDateRepub('');
      setMessage(`Devoir "${devoir.titre}" republie.`);
      await chargerDevoirs();
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function supprimer(devoir) {
    if (!window.confirm(`Supprimer definitivement le devoir "${devoir.titre}" ?`)) return;
    try {
      await api(`/classes/${classeId}/devoirs/${devoir.id}`, { method: 'DELETE' });
      if (actif && actif.id === devoir.id) setActif(null);
      await chargerDevoirs();
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

  const actifs = devoirs.filter((d) => !d.expire);
  const archives = devoirs.filter((d) => d.expire);

  return (
    <div className="page-principale">
      <Entete utilisateur={utilisateur} onDeconnexion={deconnecter} />

      <main className="contenu">
        <div className="titre-page">
          <div>
            <h1>{actif ? actif.titre : 'Mes devoirs'}</h1>
            <p className="texte-doux">
              {actif
                ? `${actif.type === 'qcm' ? 'QCM corrige automatiquement' : 'Devoir ouvert a corriger'} · avant le ${formaterDate(actif.date_fin)}`
                : 'QCM et devoirs ouverts avec date de fin : apres la date limite, ils sont archives.'}
            </p>
          </div>
          <div className="boutons-titre">
            <label className="select-classe">
              Classe
              <select value={classeId} onChange={(e) => setClasseId(e.target.value)}>
                {classes.length === 0 && <option value="">Aucune classe</option>}
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom} ({c.code})
                  </option>
                ))}
              </select>
            </label>
            {actif && (
              <button type="button" className="btn-secondaire btn-petit" onClick={() => setActif(null)}>
                ← Tous les devoirs
              </button>
            )}
          </div>
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

        {/* ============ SUIVI DES RENDUS ============ */}
        {actif ? (
          <section className="carte-bloc">
            <h2>
              Suivi des rendus — {rendus.filter((r) => r.statut !== 'a_faire' && r.statut !== 'manque').length}/{rendus.length} eleves
            </h2>

            {actif.type === 'qcm' && (
              <div className="correction-reference">
                <h3>Correction</h3>
                <ol>
                  {questionsDetail.map((q) => (
                    <li key={q.id}>
                      <strong>{q.enonce}</strong>
                      <ul>
                        {q.choix.map((c, j) => (
                          <li key={j} className={j === q.bonne_reponse ? 'bonne-reponse' : ''}>
                            {j === q.bonne_reponse ? '✔ ' : '· '}
                            {c}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="tableau-scroll">
              <table className="tableau-stats">
                <thead>
                  <tr>
                    <th>Eleve</th>
                    <th>Statut</th>
                    <th>Reponse</th>
                    <th>Note</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rendus.map((r) => (
                    <tr key={r.eleve.id}>
                      <td>
                        <strong>{r.eleve.nom}</strong>
                        <br />
                        <code className="matricule-tableau">{r.eleve.matricule}</code>
                      </td>
                      <td>
                        <BadgeStatut statut={r.statut} />
                        {r.soumis_le && (
                          <>
                            <br />
                            <span className="date-contenu">{formaterDate(r.soumis_le)}</span>
                          </>
                        )}
                      </td>
                      <td className="cellule-reponse">
                        {r.reponse === null ? (
                          <span className="vide">—</span>
                        ) : actif.type === 'qcm' ? (
                          <details>
                            <summary>Voir</summary>
                            <ul className="reponse-qcm">
                              {questionsDetail.map((q, i) => {
                                const choisi = JSON.parse(r.reponse)[i];
                                return (
                                  <li key={q.id} className={choisi === q.bonne_reponse ? 'juste' : 'faux'}>
                                    Q{i + 1} : {choisi != null && q.choix[choisi] ? q.choix[choisi] : '—'}
                                    {choisi !== q.bonne_reponse && (
                                      <span className="attendu"> (attendu : {q.choix[q.bonne_reponse]})</span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </details>
                        ) : (
                          <details>
                            <summary>Voir</summary>
                            <p className="texte-rendu">{r.reponse}</p>
                          </details>
                        )}
                      </td>
                      <td className="temps">
                        {r.note !== null && r.note !== undefined ? `${r.note}/${actif.note_max}` : '—'}
                        {r.commentaire && (
                          <>
                            <br />
                            <span className="date-contenu">{r.commentaire}</span>
                          </>
                        )}
                      </td>
                      <td>
                        {actif.type === 'ouvert' && r.statut === 'rendu' && (
                          <div className="form-correction">
                            <input
                              type="number"
                              min="0"
                              max={actif.note_max}
                              step="0.5"
                              placeholder={`/${actif.note_max}`}
                              value={(formCorr[r.rendu_id] || {}).note ?? ''}
                              onChange={(e) =>
                                setFormCorr((f) => ({
                                  ...f,
                                  [r.rendu_id]: { ...f[r.rendu_id], note: e.target.value },
                                }))
                              }
                            />
                            <input
                              type="text"
                              placeholder="Commentaire"
                              value={(formCorr[r.rendu_id] || {}).commentaire ?? ''}
                              onChange={(e) =>
                                setFormCorr((f) => ({
                                  ...f,
                                  [r.rendu_id]: { ...f[r.rendu_id], commentaire: e.target.value },
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="btn-principal btn-petit"
                              onClick={() => corriger(r)}
                            >
                              Corriger
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <>
            {/* ============ CREATION ============ */}
            {classes.length === 0 ? (
              <section className="carte-bloc">
                <p className="vide">Creez d'abord une classe dans "Mes classes".</p>
              </section>
            ) : (
              <section className="carte-bloc">
                <h2>Nouveau devoir</h2>
                <form onSubmit={creerDevoir} className="formulaire-contenu">
                  <div className="ligne-2">
                    <label>
                      Titre
                      <input
                        type="text"
                        value={titre}
                        onChange={(e) => setTitre(e.target.value)}
                        placeholder="Ex. Revision du passe compose"
                        required
                      />
                    </label>
                    <label>
                      Type
                      <select value={type} onChange={(e) => setType(e.target.value)}>
                        <option value="qcm">QCM (correction auto)</option>
                        <option value="ouvert">Devoir ouvert (a corriger)</option>
                      </select>
                    </label>
                    <label>
                      Date de fin
                      <input
                        type="datetime-local"
                        value={dateFin}
                        onChange={(e) => setDateFin(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Note sur
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={noteMax}
                        onChange={(e) => setNoteMax(e.target.value)}
                      />
                    </label>
                  </div>

                  <label>
                    Consigne {type === 'qcm' ? '(optionnel)' : ''}
                    <textarea
                      rows="3"
                      value={consigne}
                      onChange={(e) => setConsigne(e.target.value)}
                      placeholder={
                        type === 'qcm'
                          ? 'Ex. Repondez a toutes les questions.'
                          : 'Ex. Redigez un paragraphe de 10 lignes sur…'
                      }
                    />
                  </label>

                  {type === 'qcm' && (
                    <div className="editeur-questions">
                      {questions.map((q, i) => (
                        <fieldset className="question-bloc" key={i}>
                          <legend>Question {i + 1}</legend>
                          <label>
                            Enonce
                            <input
                              type="text"
                              value={q.enonce}
                              onChange={(e) => majQuestion(i, 'enonce', e.target.value)}
                              placeholder="Ex. Quel est le participe passe de 'manger' ?"
                            />
                          </label>
                          <div className="choix-liste">
                            {q.choix.map((c, j) => (
                              <div className="choix-ligne" key={j}>
                                <input
                                  type="radio"
                                  name={`bonne-${i}`}
                                  checked={q.bonne === j}
                                  onChange={() => majQuestion(i, 'bonne', j)}
                                  title="Bonne reponse"
                                />
                                <input
                                  type="text"
                                  value={c}
                                  onChange={(e) => majChoix(i, j, e.target.value)}
                                  placeholder={`Choix ${j + 1}`}
                                />
                                {q.choix.length > 2 && (
                                  <button
                                    type="button"
                                    className="btn-danger btn-petit"
                                    onClick={() => retirerChoix(i, j)}
                                    title="Retirer ce choix"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="actions">
                            <button
                              type="button"
                              className="btn-fantome"
                              onClick={() => ajouterChoix(i)}
                            >
                              + choix
                            </button>
                            {questions.length > 1 && (
                              <button
                                type="button"
                                className="btn-danger"
                                onClick={() => retirerQuestion(i)}
                              >
                                Supprimer la question
                              </button>
                            )}
                          </div>
                        </fieldset>
                      ))}
                      <button type="button" className="btn-secondaire" onClick={ajouterQuestion}>
                        + Ajouter une question
                      </button>
                      <p className="note-info">Cochez la bonne reponse (radio) de chaque question.</p>
                    </div>
                  )}

                  <button type="submit" className="btn-principal" disabled={enCours || !classeId}>
                    {enCours ? 'Creation…' : 'Creer le devoir'}
                  </button>
                </form>
              </section>
            )}

            {/* ============ LISTE : ACTIFS ============ */}
            <section className="carte-bloc">
              <h2>Devoirs en cours ({actifs.length})</h2>
              {actifs.length === 0 ? (
                <p className="vide">Aucun devoir en cours pour cette classe.</p>
              ) : (
                <ul className="liste-contenus">
                  {actifs.map((d) => (
                    <li key={d.id} className="item-contenu">
                      <div className="item-contenu-tete">
                        <span className={`pastille pastille-${d.type === 'qcm' ? 'texte' : 'video'}`}>
                          {d.type === 'qcm' ? 'QCM' : 'Ouvert'}
                        </span>
                        <strong>{d.titre}</strong>
                        <span className="tag-date">Avant le {formaterDate(d.date_fin)}</span>
                        <span className="date-contenu">
                          {d.nb_rendus}/{d.nb_eleves} rendus
                        </span>
                      </div>
                      <div className="actions">
                        <button
                          type="button"
                          className="btn-principal btn-petit"
                          onClick={() => ouvrirSuivi(d)}
                        >
                          Suivi des rendus
                        </button>
                        <button type="button" className="btn-danger" onClick={() => supprimer(d)}>
                          Supprimer
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ============ LISTE : ARCHIVES ============ */}
            <section className="carte-bloc">
              <h2>Archives ({archives.length})</h2>
              <p className="vide">
                Devoirs arrives a la date de fin : invisibles pour les eleves. Republiez-les pour
                les rendre visibles a nouveau.
              </p>
              {archives.length > 0 && (
                <ul className="liste-contenus">
                  {archives.map((d) => (
                    <li key={d.id} className="item-contenu archive">
                      <div className="item-contenu-tete">
                        <span className={`pastille pastille-${d.type === 'qcm' ? 'texte' : 'video'}`}>
                          {d.type === 'qcm' ? 'QCM' : 'Ouvert'}
                        </span>
                        <strong>{d.titre}</strong>
                        <span className="tag-date tag-expire">
                          Expire le {formaterDate(d.date_fin)}
                        </span>
                        <span className="date-contenu">
                          {d.nb_rendus}/{d.nb_eleves} rendus
                        </span>
                      </div>
                      <div className="actions">
                        <button
                          type="button"
                          className="btn-secondaire btn-petit"
                          onClick={() => ouvrirSuivi(d)}
                        >
                          Suivi des rendus
                        </button>
                        <button
                          type="button"
                          className="btn-principal btn-petit"
                          onClick={() => {
                            setRepublie(republie === d.id ? null : d.id);
                            setDateRepub('');
                            setErreur('');
                          }}
                        >
                          Republier
                        </button>
                        <button type="button" className="btn-danger" onClick={() => supprimer(d)}>
                          Supprimer
                        </button>
                      </div>
                      {republie === d.id && (
                        <div className="republication">
                          <label>
                            Nouvelle date de fin
                            <input
                              type="datetime-local"
                              value={dateRepub}
                              onChange={(e) => setDateRepub(e.target.value)}
                            />
                          </label>
                          <button
                            type="button"
                            className="btn-principal btn-petit"
                            onClick={() => republier(d)}
                          >
                            Confirmer
                          </button>
                          <button
                            type="button"
                            className="btn-fantome"
                            onClick={() => {
                              setRepublie(null);
                              setDateRepub('');
                            }}
                          >
                            Annuler
                          </button>
                        </div>
                      )}
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
