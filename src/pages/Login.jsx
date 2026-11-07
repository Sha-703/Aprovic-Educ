import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';

/** Page de connexion unique : un seul formulaire, role choisi directement. */
export default function Login() {
  const [role, setRole] = useState('eleve');
  const [matricule, setMatricule] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const navigate = useNavigate();

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    setChargement(true);
    try {
      const donnees = await api('/auth/connexion', {
        method: 'POST',
        corps: { role, matricule, motDePasse: role === 'enseignant' ? motDePasse : undefined },
      });
      setToken(donnees.token);
      navigate('/espace');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  }

  return (
    <div className="page-auth">
      <div className="panneau-form">
        <div className="carte-auth">
        <div className="logo">
          <img src="/icon.svg" alt="" width="56" height="56" />
          <div>
            <h1>Aprovic Educ</h1>
            <p className="sous-titre">Enseignement du francais — classe inversee</p>
          </div>
        </div>

        <div className="choix-role" role="tablist" aria-label="Choisir votre role">
          <button
            type="button"
            role="tab"
            aria-selected={role === 'eleve'}
            className={role === 'eleve' ? 'actif' : ''}
            onClick={() => { setRole('eleve'); setErreur(''); }}
          >
            Je suis eleve
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={role === 'enseignant'}
            className={role === 'enseignant' ? 'actif' : ''}
            onClick={() => { setRole('enseignant'); setErreur(''); }}
          >
            Je suis enseignant
          </button>
        </div>

        <form onSubmit={soumettre} className="formulaire">
          <label>
            Matricule
            <input
              type="text"
              value={matricule}
              onChange={(e) => setMatricule(e.target.value)}
              placeholder={role === 'eleve' ? 'Ex. FRA1A-7K3M9P' : 'Ex. ENS-7K3M9P'}
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck="false"
              required
            />
          </label>

          {role === 'enseignant' && (
            <label>
              Mot de passe
              <input
                type="password"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                placeholder="Votre mot de passe"
                autoComplete="current-password"
                required
              />
            </label>
          )}

          {erreur && <p className="erreur" role="alert">{erreur}</p>}

          <button type="submit" className="btn-principal" disabled={chargement}>
            {chargement ? 'Connexion en cours…' : role === 'eleve' ? 'Acceder a mon espace' : 'Se connecter'}
          </button>
        </form>

        <p className="liens">
          {role === 'enseignant' ? (
            <>Pas encore de compte ? <Link to="/inscription">Creer un compte enseignant</Link></>
          ) : (
            <>Votre matricule vous est remis par votre enseignant.</>
          )}
        </p>
        </div>
      </div>

      <div className="panneau-visuel" aria-hidden="true">
        <img src="/classe-inversee.svg" alt="" />
        <div className="voile-degrade" />
        <div className="visuel-texte">
          <span className="visuel-badge">La classe inversee</span>
          <h2>Chez soi, on decouvre.<br />En classe, on avance.</h2>
          <p>
            Les eleves visionnent les lecons chez eux a leur rythme, puis l'enseignant
            guide les exercices et les discussions en classe.
          </p>
        </div>
      </div>
    </div>
  );
}
