import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiForm, setToken } from '../api.js';
import Entete from '../components/Entete.jsx';
import Visualiseur from '../components/Visualiseur.jsx';
import { formaterDate, formaterTaille } from '../utils.js';

const LIBELLES = { texte: 'Texte', video: 'Video', pdf: 'PDF', fichier: 'Fichier' };

/** Espace enseignant : creer des contenus (texte, video, PDF, fichier) par classe. */
export default function Contenus() {
  const [utilisateur, setUtilisateur] = useState(null);
  const [classes, setClasses] = useState([]);
  const [classeId, setClasseId] = useState('');
  const [contenus, setContenus] = useState([]);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  // Formulaire
  const [titre, setTitre] = useState('');
  const [type, setType] = useState('texte');
  const [dateFin, setDateFin] = useState('');
  const [corps, setCorps] = useState('');
  const [url, setUrl] = useState('');
  const [fichier, setFichier] = useState(null);
  const [enCours, setEnCours] = useState(false);

  // Republication d'un contenu archive
  const [republie, setRepublie] = useState(null); // id du contenu
  const [dateRepub, setDateRepub] = useState('');

  const [ouvert, setOuvert] = useState(null); // contenu affiche
  const navigate = useNavigate();

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
        const donnees = await api('/classes');
        setClasses(donnees.classes);
        if (donnees.classes.length > 0) setClasseId(String(donnees.classes[0].id));
      })
      .catch(deconnecter);
  }, []);

  useEffect(() => {
    if (!classeId) {
      setContenus([]);
      return;
    }
    api(`/classes/${classeId}/contenus`)
      .then((d) => setContenus(d.contenus))
      .catch((e) => setErreur(e.message));
  }, [classeId]);

  async function creerContenu(e) {
    e.preventDefault();
    setErreur('');
    setMessage('');

    if (!dateFin) {
      setErreur('Indiquez une date de fin pour ce contenu.');
      return;
    }

    const fd = new FormData();
    fd.append('titre', titre);
    fd.append('type', type);
    fd.append('date_fin', new Date(dateFin).toISOString());
    if (type === 'texte') fd.append('corps', corps);
    if (type === 'video' && !fichier) fd.append('url', url);
    if (fichier) fd.append('fichier', fichier);

    setEnCours(true);
    try {
      await apiForm(`/classes/${classeId}/contenus`, fd);
      const donnees = await api(`/classes/${classeId}/contenus`);
      setContenus(donnees.contenus);
      setMessage(`Contenu "${titre}" publie.`);
      setTitre('');
      setCorps('');
      setUrl('');
      setFichier(null);
      setDateFin('');
      e.target.reset?.();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  }

  async function republier(contenu) {
    if (!dateRepub) {
      setErreur('Choisissez une nouvelle date de fin.');
      return;
    }
    setErreur('');
    try {
      await api(`/classes/${classeId}/contenus/${contenu.id}/republier`, {
        method: 'PUT',
        corps: { date_fin: new Date(dateRepub).toISOString() },
      });
      const donnees = await api(`/classes/${classeId}/contenus`);
      setContenus(donnees.contenus);
      setRepublie(null);
      setDateRepub('');
      setMessage(`Contenu "${contenu.titre}" republie.`);
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

  const actifs = contenus.filter((c) => !c.expire);
  const archives = contenus.filter((c) => c.expire);

  return (
    <div className="page-principale">
      <Entete utilisateur={utilisateur} onDeconnexion={deconnecter} />

      <main className="contenu">
        <div className="titre-page">
          <div>
            <h1>Mes contenus</h1>
            <p className="texte-doux">
              Textes, videos, PDF et fichiers a publier pour vos classes (classe inversee).
            </p>
          </div>
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

        {classes.length === 0 ? (
          <section className="carte-bloc">
            <p className="vide">Creez d'abord une classe dans "Mes classes".</p>
          </section>
        ) : (
          <section className="carte-bloc">
            <h2>Publier un contenu</h2>
            <form onSubmit={creerContenu} className="formulaire-contenu">
              <div className="ligne-2">
                <label>
                  Titre
                  <input
                    type="text"
                    value={titre}
                    onChange={(e) => setTitre(e.target.value)}
                    placeholder="Ex. Le passe compose — video"
                    required
                  />
                </label>
                <label>
                  Type
                  <select value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="texte">Texte</option>
                    <option value="video">Video</option>
                    <option value="pdf">PDF</option>
                    <option value="fichier">Fichier</option>
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
              </div>

              {type === 'texte' && (
                <label>
                  Contenu
                  <textarea
                    rows="6"
                    value={corps}
                    onChange={(e) => setCorps(e.target.value)}
                    placeholder="Ecrivez ici le texte que les eleves vont lire…"
                    required
                  />
                </label>
              )}

              {type === 'video' && (
                <>
                  <label>
                    URL de la video (YouTube, lien direct…)
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=…"
                      disabled={!!fichier}
                    />
                  </label>
                  <label className="ou">ou televersez un fichier video</label>
                </>
              )}

              {(type === 'pdf' || type === 'fichier' || type === 'video') && (
                <label>
                  Fichier {type === 'texte' ? '' : type === 'video' ? '(optionnel si URL)' : `(max 300 Mo)`}
                  <input
                    type="file"
                    accept={
                      type === 'pdf'
                        ? '.pdf'
                        : type === 'video'
                          ? 'video/*'
                          : undefined
                    }
                    onChange={(e) => setFichier(e.target.files?.[0] || null)}
                  />
                </label>
              )}

              {fichier && <p className="info-fichier">Fichier choisi : {fichier.name}</p>}

              <button type="submit" className="btn-principal" disabled={enCours || !classeId}>
                {enCours ? 'Publication…' : 'Publier'}
              </button>
            </form>
          </section>
        )}

        <section className="carte-bloc">
          <h2>Contenus en ligne ({actifs.length})</h2>
          {actifs.length === 0 ? (
            <p className="vide">Aucun contenu en cours pour cette classe.</p>
          ) : (
            <ul className="liste-contenus">
              {actifs.map((contenu) => (
                <li key={contenu.id} className="item-contenu">
                  <div className="item-contenu-tete">
                    <span className={`pastille pastille-${contenu.type}`}>
                      {LIBELLES[contenu.type]}
                    </span>
                    <strong>{contenu.titre}</strong>
                    <span className="tag-date">
                      {contenu.date_fin
                        ? `Jusqu'au ${formaterDate(contenu.date_fin)}`
                        : 'Permanent'}
                    </span>
                    <span className="date-contenu">{formaterDate(contenu.cree_le)}</span>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn-principal btn-petit"
                      onClick={() => setOuvert(ouvert === contenu.id ? null : contenu.id)}
                    >
                      {ouvert === contenu.id ? 'Fermer' : 'Ouvrir'}
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={async () => {
                        if (!window.confirm(`Supprimer le contenu "${contenu.titre}" ?`)) return;
                        try {
                          await api(`/classes/${classeId}/contenus/${contenu.id}`, {
                            method: 'DELETE',
                          });
                          setContenus((liste) => liste.filter((c) => c.id !== contenu.id));
                          if (ouvert === contenu.id) setOuvert(null);
                        } catch (err) {
                          setErreur(err.message);
                        }
                      }}
                    >
                      Supprimer
                    </button>
                  </div>
                  {ouvert === contenu.id && (
                    <div className="apercu-contenu">
                      <Visualiseur contenu={contenu} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="carte-bloc">
          <h2>Archives ({archives.length})</h2>
          <p className="vide">
            Contenus arrives a la date de fin : invisibles pour les eleves. Vous pouvez les
            republier avec une nouvelle date.
          </p>
          {archives.length > 0 && (
            <ul className="liste-contenus">
              {archives.map((contenu) => (
                <li key={contenu.id} className="item-contenu archive">
                  <div className="item-contenu-tete">
                    <span className={`pastille pastille-${contenu.type}`}>
                      {LIBELLES[contenu.type]}
                    </span>
                    <strong>{contenu.titre}</strong>
                    <span className="tag-date tag-expire">
                      Expire le {formaterDate(contenu.date_fin)}
                    </span>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn-secondaire btn-petit"
                      onClick={() => setOuvert(ouvert === contenu.id ? null : contenu.id)}
                    >
                      {ouvert === contenu.id ? 'Fermer' : 'Ouvrir'}
                    </button>
                    <button
                      type="button"
                      className="btn-principal btn-petit"
                      onClick={() => {
                        setRepublie(republie === contenu.id ? null : contenu.id);
                        setDateRepub('');
                        setErreur('');
                      }}
                    >
                      Republier
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={async () => {
                        if (!window.confirm(`Supprimer definitivement "${contenu.titre}" ?`)) return;
                        try {
                          await api(`/classes/${classeId}/contenus/${contenu.id}`, {
                            method: 'DELETE',
                          });
                          setContenus((liste) => liste.filter((c) => c.id !== contenu.id));
                          if (ouvert === contenu.id) setOuvert(null);
                        } catch (err) {
                          setErreur(err.message);
                        }
                      }}
                    >
                      Supprimer
                    </button>
                  </div>
                  {republie === contenu.id && (
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
                        onClick={() => republier(contenu)}
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
                  {ouvert === contenu.id && (
                    <div className="apercu-contenu">
                      <Visualiseur contenu={contenu} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
