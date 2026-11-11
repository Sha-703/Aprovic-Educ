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

// 13. Recherche globale — sans jeton
const { statut: sRech401 } = await appel('/recherche?q=ab');
verifier('Recherche sans jeton refusee (401)', sRech401 === 401);

// 14. Recherche globale — term trop court
const { statut: sRechCourt } = await appel('/recherche?q=a', { token });
verifier('Recherche avec 1 seul caractere refusee (400)', sRechCourt === 400);

// 15. Une classe et un eleve pour chercher dessus
const { statut: sClRech, data: dClRech } = await appel('/classes', {
  method: 'POST',
  corps: { nom: 'Recherche Test', niveau: '1ere', option_classe: 'Scientifique' },
  token,
});
const codeRech = dClRech.classe?.code;
verifier('Classe de test creee pour la recherche', sClRech === 201 && !!codeRech, codeRech);

const { statut: sElRech, data: dElRech } = await appel(`/classes/${dClRech.classe.id}/eleves`, {
  method: 'POST',
  corps: { nom: 'Zokou Awa' },
  token,
});
const matriculeRech = dElRech.eleves?.[0]?.matricule;
verifier('Eleve de test cree pour la recherche', sElRech === 201 && !!matriculeRech, matriculeRech);

// 16. Trouver la classe par son nom, puis par son code
const { statut: sR1, data: dR1 } = await appel('/recherche?q=Recherche Test', { token });
verifier(
  'Recherche d une classe par son nom',
  sR1 === 200 && dR1.classes?.some((c) => c.code === codeRech),
  `${dR1.classes?.length || 0} classe(s)`
);

const { statut: sR2, data: dR2 } = await appel(`/recherche?q=${codeRech}`, { token });
verifier(
  'Recherche d une classe par son code',
  sR2 === 200 && dR2.classes?.some((c) => c.code === codeRech)
);

// 17. Trouver l eleve par son nom, avec son matricule
const { statut: sR3, data: dR3 } = await appel('/recherche?q=Zokou', { token });
verifier(
  'Recherche d un eleve par son nom',
  sR3 === 200 && dR3.eleves?.some((e) => e.matricule === matriculeRech),
  `${dR3.eleves?.length || 0} eleve(s)`
);

// 18. Aucun resultat : toutes les listes vides
const { statut: sR4, data: dR4 } = await appel('/recherche?q=zzzzqqq', { token });
verifier(
  'Recherche sans resultat renvoie des listes vides',
  sR4 === 200 &&
    dR4.classes.length === 0 &&
    dR4.eleves.length === 0 &&
    dR4.devoirs.length === 0 &&
    dR4.contenus.length === 0
);

// 19. L eleve connecte peut rechercher dans sa classe
const { data: dConnEl } = await appel('/auth/connexion', {
  method: 'POST',
  corps: { role: 'eleve', matricule: matriculeRech },
});
const { statut: sR5, data: dR5 } = await appel('/recherche?q=Recherche', {
  token: dConnEl.token,
});
verifier(
  'Un eleve peut lancer une recherche (200)',
  sR5 === 200 && Array.isArray(dR5.devoirs) && Array.isArray(dR5.contenus)
);

// Nettoyage : la classe de test ne reste pas dans la base
const { statut: sSupRech } = await appel(`/classes/${dClRech.classe.id}`, {
  method: 'DELETE',
  token,
});
verifier('Classe de test supprimee apres la recherche', sSupRech === 200);

// 20. Page d'etat /health — reponse JSON pour Render et les moniteurs
const resHealth = await fetch('http://localhost:3001/health');
const dHealth = await resHealth.json();
verifier(
  'GET /health (JSON)',
  resHealth.status === 200 && dHealth.etat === 'ok' && dHealth.base_accessible === true,
  `${dHealth.base} · ${dHealth.stockage}`
);

// 21. Page d'etat /health — page HTML dans le navigateur
const resHealthHtml = await fetch('http://localhost:3001/health', {
  headers: { Accept: 'text/html,application/xhtml+xml' },
});
const htmlHealth = await resHealthHtml.text();
verifier(
  'GET /health rend une page HTML',
  resHealthHtml.status === 200 &&
    String(resHealthHtml.headers.get('content-type')).includes('text/html') &&
    htmlHealth.includes('Aprovic Educ') &&
    htmlHealth.includes('operationnel')
);

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
