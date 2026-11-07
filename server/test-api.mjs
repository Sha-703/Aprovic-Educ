// Tests rapides de l'API Phase 1 (a lancer pendant que le serveur tourne)
const BASE = 'http://localhost:3001/api';

let echecs = 0;
function verifier(label, condition, detail = '') {
  console.log(`${condition ? '✔' : '✘'} ${label}${detail ? ' → ' + detail : ''}`);
  if (!condition) echecs++;
}

async function appel(chemin, { method = 'GET', corps, token } = {}) {
  const res = await fetch(BASE + chemin, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { statut: res.status, data };
}

const { statut: sSante, data: dSante } = await appel('/sante');
verifier('GET /sante', sSante === 200 && dSante.application === 'Aprovic Educ');

// 1. Inscription enseignant
const email = `test${Date.now()}@aprovic.test`;
const { statut: sInsc, data: dInsc } = await appel('/auth/inscription-enseignant', {
  method: 'POST',
  corps: { nom: 'Mme Test', email, motDePasse: 'secret123', ecole: 'Lycee Aprovic Test' },
});
const matricule = dInsc.matricule;
verifier('Inscription enseignant renvoie un matricule', sInsc === 201 && /^ENS-[A-Z2-9]{6}$/.test(matricule || ''), matricule);

// 2. Deuxième inscription → matricule different
const email2 = `test2${Date.now()}@aprovic.test`;
const { data: dInsc2 } = await appel('/auth/inscription-enseignant', {
  method: 'POST',
  corps: { nom: 'M. Autre', email: email2, motDePasse: 'secret123', ecole: 'College Autre' },
});
verifier('Matricules uniques entre comptes', dInsc2.matricule !== matricule, dInsc2.matricule);

// 2bis. Inscription sans ecole refusee
const { statut: sSansEcole } = await appel('/auth/inscription-enseignant', {
  method: 'POST',
  corps: { nom: 'Sans Ecole', email: `s-ecole${Date.now()}@aprovic.test`, motDePasse: 'secret123' },
});
verifier('Inscription sans ecole refusee (400)', sSansEcole === 400);

// 3. Email deja utilise
const { statut: sDup } = await appel('/auth/inscription-enseignant', {
  method: 'POST',
  corps: { nom: 'Doublon', email, motDePasse: 'secret123', ecole: 'Lycee Aprovic Test' },
});
verifier('Email en double refuse (409)', sDup === 409);

// 4. Connexion enseignant avec mot de passe correct
const { statut: sConn, data: dConn } = await appel('/auth/connexion', {
  method: 'POST',
  corps: { role: 'enseignant', matricule: matricule.toLowerCase(), motDePasse: 'secret123' },
});
verifier('Connexion enseignant (matricule + mot de passe)', sConn === 200 && !!dConn.token);
const token = dConn.token;

// 5. Mauvais mot de passe
const { statut: sMdp } = await appel('/auth/connexion', {
  method: 'POST',
  corps: { role: 'enseignant', matricule, motDePasse: 'faux' },
});
verifier('Mauvais mot de passe refuse (401)', sMdp === 401);

// 6. Connexion eleve avec un matricule inexistant
const { statut: sEleve } = await appel('/auth/connexion', {
  method: 'POST',
  corps: { role: 'eleve', matricule: 'XXXXXX-000000' },
});
verifier('Connexion eleve matricule inconnu refuse (401)', sEleve === 401);

// 7. /auth/me avec token
const resMe = await fetch(BASE + '/auth/me', { headers: { Authorization: `Bearer ${token}` } });
const dMe = await resMe.json();
verifier('GET /auth/me avec token', resMe.status === 200 && dMe.utilisateur?.matricule === matricule);

// 8. /auth/me sans token
const resMe2 = await fetch(BASE + '/auth/me');
verifier('GET /auth/me sans token refuse (401)', resMe2.status === 401);

// 9. Role eleve ne peut pas se connecter avec un matricule d'enseignant
const { statut: sCroise } = await appel('/auth/connexion', {
  method: 'POST',
  corps: { role: 'eleve', matricule },
});
verifier('Un matricule enseignant ne donne pas acces espace eleve (401)', sCroise === 401);

// 10. Reglages — mise a jour du profil
const { statut: sProfil, data: dProfil } = await appel('/auth/profil', {
  method: 'PUT',
  corps: { nom: 'Mme Test Modifiee', email },
  token,
});
verifier(
  'PUT /auth/profil met a jour le nom',
  sProfil === 200 && dProfil.utilisateur?.nom === 'Mme Test Modifiee'
);

// 11. Reglages — e-mail deja utilise par un autre compte
const { statut: sProfilDoublon } = await appel('/auth/profil', {
  method: 'PUT',
  corps: { nom: 'Mme Test Modifiee', email: email2 },
  token,
});
verifier('Changement vers un e-mail existant refuse (409)', sProfilDoublon === 409);

// 12. Reglages — changement de mot de passe
const { statut: sMdpFaux } = await appel('/auth/mot-de-passe', {
  method: 'PUT',
  corps: { actuel: 'faux', nouveau: 'nouveau456' },
  token,
});
verifier('Mauvais mot de passe actuel refuse (401)', sMdpFaux === 401);

const { statut: sMdpOk } = await appel('/auth/mot-de-passe', {
  method: 'PUT',
  corps: { actuel: 'secret123', nouveau: 'nouveau456' },
  token,
});
verifier('Changement de mot de passe accepte (200)', sMdpOk === 200);

const { statut: sConnNouveau } = await appel('/auth/connexion', {
  method: 'POST',
  corps: { role: 'enseignant', matricule, motDePasse: 'nouveau456' },
});
verifier('Connexion avec le nouveau mot de passe', sConnNouveau === 200);

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
