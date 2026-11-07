import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

/** Inscription enseignant → le systeme lui attribue un matricule de connexion. */
export default function Inscription() {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [ecole, setEcole] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const [matricule, setMatricule] = useState(null);
  const [copie, setCopie] = useState(false);
  const navigate = useNavigate();

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setChargement(true);
    try {
      const donnees = await api('/auth/inscription-enseignant', {
        method: 'POST',
        corps: { nom, email, ecole, motDePasse },
      });
      setMatricule(donnees.matricule);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(matricule);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      setCopie(false);
    }
  }

  if (matricule) {
    return (
      <div className="page-auth page-simple">
        <div className="carte-auth centre">
          <div className="succes-icone">✔</div>
          <h2>Compte cree !</h2>
          <p className="texte-doux">
            Voici votre <strong>matricule</strong>. Il est unique et sert a vous connecter :
            notez-le et gardez-le precieusement.
          </p>
          <div className="matricule-affiche" onClick={copier} title="Cliquer pour copier">
            {matricule}
          </div>
          <button type="button" className="btn-secondaire" onClick={copier}>
            {copie ? 'Copie !' : 'Copier le matricule'}
          </button>
          <button type="button" className="btn-principal" onClick={() => navigate('/')}>
            Aller a la connexion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-auth page-simple">
      <div className="carte-auth">
        <div className="logo">
          <img src="/icon.svg" alt="" width="56" height="56" />
          <div>
            <h1>Compte enseignant</h1>
            <p className="sous-titre">Aprovic Educ</p>
          </div>
        </div>

        <form onSubmit={soumettre} className="formulaire">
          <label>
            Nom complet
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex. Mme Kouassi"
              required
            />
          </label>
          <label>
            Adresse e-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              required
            />
          </label>
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
          <label>
            Mot de passe
            <input
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              placeholder="6 caracteres minimum"
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Confirmer le mot de passe
            <input
              type="password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="Retapez le mot de passe"
              autoComplete="new-password"
              required
            />
          </label>

          {erreur && <p className="erreur" role="alert">{erreur}</p>}

          <button type="submit" className="btn-principal" disabled={chargement}>
            {chargement ? 'Creation en cours…' : 'Creer mon compte'}
          </button>
        </form>

        <p className="liens">
          Deja un compte ? <Link to="/">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
