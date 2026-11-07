import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';
import Entete from '../components/Entete.jsx';
import Visualiseur from '../components/Visualiseur.jsx';
import { formaterDate, formaterTaille } from '../utils.js';

const LIBELLES = { texte: 'Texte', video: 'Video', pdf: 'PDF', fichier: 'Fichier' };

/** Espace eleve : lit les contenus publies par son enseignant (classe inversee). */
export default function MesContenus() {
  const [utilisateur, setUtilisateur] = useState(null);
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState('');
  const [ouvert, setOuvert] = useState(null);
  const navigate = useNavigate();

  function deconnecter() {
    setToken(null);
    navigate('/');
  }

  useEffect(() => {
    api('/auth/me')
      .then((d) => setUtilisateur(d.utilisateur))
      .catch(deconnecter);
    api('/eleve/mes-contenus')
      .then(setDonnees)
      .catch((e) => setErreur(e.message));
  }, []);

  if (!utilisateur || !donnees) {
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
            <h1>Mes contenus</h1>
            <p className="texte-doux">
              {donnees.classe
                ? `Classe ${donnees.classe.nom} — lisez les contenus avant la classe.`
                : 'Vos contenus de classe.'}
            </p>
          </div>
        </div>

        {erreur && (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        )}

        <section className="carte-bloc">
          <h2>Publies par votre enseignant ({donnees.contenus.length})</h2>
          {donnees.contenus.length === 0 ? (
            <p className="vide">
              Aucun contenu pour le moment — votre enseignant n'a pas encore publie.
            </p>
          ) : (
            <ul className="liste-contenus">
              {donnees.contenus.map((contenu) => (
                <li key={contenu.id} className="item-contenu">
                  <div className="item-contenu-tete">
                    <span className={`pastille pastille-${contenu.type}`}>
                      {LIBELLES[contenu.type]}
                    </span>
                    <strong>{contenu.titre}</strong>
                    {contenu.date_fin && (
                      <span className="tag-date">
                        Jusqu'au {formaterDate(contenu.date_fin)}
                      </span>
                    )}
                    <span className="date-contenu">{formaterDate(contenu.cree_le)}</span>
                  </div>
                  {contenu.type !== 'texte' && contenu.nom_fichier && (
                    <p className="info-fichier">
                      {contenu.nom_fichier}
                      {contenu.taille ? ` · ${formaterTaille(contenu.taille)}` : ''}
                    </p>
                  )}
                  <div className="actions">
                    <button
                      type="button"
                      className="btn-principal btn-petit"
                      onClick={() => setOuvert(ouvert === contenu.id ? null : contenu.id)}
                    >
                      {ouvert === contenu.id ? 'Fermer' : contenu.type === 'texte' ? 'Lire' : 'Ouvrir'}
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
      </main>
    </div>
  );
}
