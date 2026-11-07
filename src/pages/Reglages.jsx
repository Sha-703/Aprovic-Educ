import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';
import Entete from '../components/Entete.jsx';

/** Reglages du compte : profil, mot de passe, infos du compte. */
export default function Reglages() {
  const [utilisateur, setUtilisateur] = useState(null);
  const navigate = useNavigate();

  // Profil
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [ecole, setEcole] = useState('');
  const [msgProfil, setMsgProfil] = useState('');
  const [errProfil, setErrProfil] = useState('');

  // Mot de passe
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [msgMdp, setMsgMdp] = useState('');
  const [errMdp, setErrMdp] = useState('');

  function deconnecter() {
    setToken(null);
    navigate('/');
  }

  useEffect(() => {
    api('/auth/me')
      .then((d) => {
        setUtilisateur(d.utilisateur);
        setNom(d.utilisateur.nom);
        setEmail(d.utilisateur.email || '');
        setEcole(d.utilisateur.ecole || '');
      })
      .catch(deconnecter);
  }, []);

  async function enregistrerProfil(e) {
    e.preventDefault();
    setMsgProfil('');
    setErrProfil('');
    try {
      const donnees = await api('/auth/profil', {
        method: 'PUT',
        corps: {
          nom,
          email: utilisateur.role === 'eleve' ? email || undefined : email,
          ecole: estEnseignant ? ecole : undefined,
        },
      });
      setUtilisateur(donnees.utilisateur);
      setMsgProfil(donnees.message || 'Profil mis a jour.');
    } catch (err) {
      setErrProfil(err.message);
    }
  }

  async function changerMotDePasse(e) {
    e.preventDefault();
    setMsgMdp('');
    setErrMdp('');
    if (nouveau !== confirmation) {
      setErrMdp('Les deux mots de passe ne correspondent pas.');
      return;
    }
    try {
      const donnees = await api('/auth/mot-de-passe', {
        method: 'PUT',
        corps: { actuel, nouveau },
      });
      setMsgMdp(donnees.message || 'Mot de passe modifie.');
      setActuel('');
      setNouveau('');
      setConfirmation('');
    } catch (err) {
      setErrMdp(err.message);
    }
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
        <div className="titre-page">
          <div>
            <h1>Reglages</h1>
            <p className="texte-doux">Gerez les informations de votre compte.</p>
          </div>
        </div>

        <section className="carte-bloc">
          <h2>Mon profil</h2>
          <form onSubmit={enregistrerProfil} className="formulaire">
            <label>
              Nom complet
              <input
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                required
              />
            </label>
            <label>
              Adresse e-mail {estEnseignant ? '' : '(optionnel)'}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={estEnseignant ? 'vous@exemple.com' : 'Non renseigne'}
              />
            </label>
            {estEnseignant && (
              <label>
                Ecole
                <input
                  type="text"
                  value={ecole}
                  onChange={(e) => setEcole(e.target.value)}
                  placeholder="Ex. Lycee Bilingue de Douala"
                  required
                />
              </label>
            )}

            {errProfil && (
              <p className="erreur" role="alert">
                {errProfil}
              </p>
            )}
            {msgProfil && (
              <p className="succes" role="status">
                {msgProfil}
              </p>
            )}

            <button type="submit" className="btn-principal">
              Enregistrer
            </button>
          </form>
        </section>

        {estEnseignant && (
          <section className="carte-bloc">
            <h2>Changer mon mot de passe</h2>
            <form onSubmit={changerMotDePasse} className="formulaire">
              <label>
                Mot de passe actuel
                <input
                  type="password"
                  value={actuel}
                  onChange={(e) => setActuel(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <label>
                Nouveau mot de passe
                <input
                  type="password"
                  value={nouveau}
                  onChange={(e) => setNouveau(e.target.value)}
                  placeholder="6 caracteres minimum"
                  autoComplete="new-password"
                  required
                />
              </label>
              <label>
                Confirmer le nouveau mot de passe
                <input
                  type="password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>

              {errMdp && (
                <p className="erreur" role="alert">
                  {errMdp}
                </p>
              )}
              {msgMdp && (
                <p className="succes" role="status">
                  {msgMdp}
                </p>
              )}

              <button type="submit" className="btn-principal">
                Modifier le mot de passe
              </button>
            </form>
          </section>
        )}

        <section className="carte-bloc">
          <h2>Infos du compte</h2>
          <dl className="infos-compte infos-large">
            <div>
              <dt>Nom</dt>
              <dd>{utilisateur.nom}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{estEnseignant ? 'Enseignant' : 'Eleve'}</dd>
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
            {estEnseignant && (
              <div>
                <dt>Ecole</dt>
                <dd>{utilisateur.ecole || '—'}</dd>
              </div>
            )}
          </dl>
          {!estEnseignant && (
            <p className="note-info">
              Votre matricule est genere par le systeme : il ne peut pas etre modifie. Il vous sert
              a vous connecter.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
