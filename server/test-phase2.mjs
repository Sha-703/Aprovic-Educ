// Tests Phase 2 : classes, eleves, matricules, espaces
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
    body: corps !== undefined ? JSON.stringify(corps) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { statut: res.status, data };
}

const horodatage = Date.now();

// --- Comptes enseignants ---
const { data: insc1 } = await appel('/auth/inscription-enseignant', {
  method: 'POST',
  corps: { nom: 'Enseignant Un', email: `p1${horodatage}@t.test`, motDePasse: 'secret123', ecole: 'Lycee Phase2' },
});
const { data: insc2 } = await appel('/auth/inscription-enseignant', {
  method: 'POST',
  corps: { nom: 'Enseignant Deux', email: `p2${horodatage}@t.test`, motDePasse: 'secret123', ecole: 'College Phase2' },
});
const { data: conn1 } = await appel('/auth/connexion', {
  method: 'POST',
  corps: { role: 'enseignant', matricule: insc1.matricule, motDePasse: 'secret123' },
});
const { data: conn2 } = await appel('/auth/connexion', {
  method: 'POST',
  corps: { role: 'enseignant', matricule: insc2.matricule, motDePasse: 'secret123' },
});
const t1 = conn1.token;
const t2 = conn2.token;
verifier('Deux enseignants connectes', !!t1 && !!t2);

// --- Creation de classes ---
const { statut: sClasse, data: dClasse } = await appel('/classes', {
  method: 'POST',
  corps: { nom: '6eme A', niveau: '6eme', option_classe: 'Scientifique' },
  token: t1,
});
verifier(
  'Creation classe avec code auto-genere',
  sClasse === 201 && /^[A-Z2-9]{4}$/.test(dClasse.classe?.code || ''),
  `${dClasse.classe?.nom} (${dClasse.classe?.code})`
);
verifier(
  'La classe conserve niveau et option',
  dClasse.classe?.niveau === '6eme' && dClasse.classe?.option_classe === 'Scientifique',
  `${dClasse.classe?.niveau} · ${dClasse.classe?.option_classe}`
);
const classe = dClasse.classe;

// Code unique a chaque execution (les tests doivent pouvoir etre relances)
const codeUnique = `C${String(horodatage % 100000)}`;

const { statut: sCode, data: dCode } = await appel('/classes', {
  method: 'POST',
  corps: { nom: '5eme B', code: codeUnique },
  token: t1,
});
verifier('Creation classe avec code personnalise', sCode === 201 && dCode.classe?.code === codeUnique, codeUnique);

const { statut: sDoublon } = await appel('/classes', {
  method: 'POST',
  corps: { nom: 'Clone', code: codeUnique },
  token: t1,
});
verifier('Code de classe en double refuse (409)', sDoublon === 409);

const { statut: sInvalide } = await appel('/classes', {
  method: 'POST',
  corps: { nom: 'Mauvais', code: 'x!' },
  token: t1,
});
verifier('Code invalide refuse (400)', sInvalide === 400);

const { data: dListe } = await appel('/classes', { token: t1 });
verifier('Liste des classes (2) avec compteur d\'eleves', dListe.classes?.length === 2);

// --- Ajout d'eleves ---
const { statut: sEleves, data: dEleves } = await appel(`/classes/${classe.id}/eleves`, {
  method: 'POST',
  corps: { noms: ['Kouassi Aya', 'Diop Moussa'] },
  token: t1,
});
const matricules = (dEleves.eleves || []).map((e) => e.matricule);
verifier(
  'Ajout de 2 eleves avec matricules CODECLASSE-XXXXXX',
  sEleves === 201 &&
    matricules.length === 2 &&
    matricules.every((m) => m.startsWith(`${classe.code}-`) && /^.+-[A-Z2-9]{6}$/.test(m)),
  matricules.join(', ')
);
verifier('Matricules eleves uniques', new Set(matricules).size === 2);

const { data: dDetail } = await appel(`/classes/${classe.id}/eleves`, { token: t1 });
verifier('Detail de la classe : 2 eleves', dDetail.eleves?.length === 2);

// --- Connexion eleve + espace eleve ---
const { statut: sConnEleve, data: dConnEleve } = await appel('/auth/connexion', {
  method: 'POST',
  corps: { role: 'eleve', matricule: matricules[0] },
});
verifier('Connexion eleve avec son matricule seul', sConnEleve === 200 && !!dConnEleve.token);
const te = dConnEleve.token;

const { statut: sMaClasse, data: dMaClasse } = await appel('/eleve/ma-classe', { token: te });
verifier(
  'GET /eleve/ma-classe : classe + enseignant + camarades',
  sMaClasse === 200 &&
    dMaClasse.classe?.nom === '6eme A' &&
    dMaClasse.enseignant === 'Enseignant Un' &&
    dMaClasse.camarades?.length === 1 &&
    dMaClasse.matricule === matricules[0],
  `${dMaClasse.classe?.nom} · ${dMaClasse.enseignant} · ${dMaClasse.camarades?.length} camarade(s)`
);

const { statut: sEleveClasses } = await appel('/classes', { token: te });
verifier('Un eleve ne peut pas acceder a /classes (403)', sEleveClasses === 403);

// --- Isolation entre enseignants ---
const { statut: sAutre } = await appel(`/classes/${classe.id}/eleves`, { token: t2 });
verifier('Un autre enseignant ne voit pas la classe (404)', sAutre === 404);

const { statut: sSupAutre } = await appel(`/classes/${classe.id}`, { method: 'DELETE', token: t2 });
verifier('Un autre enseignant ne peut pas la supprimer (404)', sSupAutre === 404);

// --- Suppression d'un eleve ---
const idEleve2 = dEleves.eleves[1].id;
const { statut: sSupEleve } = await appel(`/classes/${classe.id}/eleves/${idEleve2}`, {
  method: 'DELETE',
  token: t1,
});
verifier('Suppression d\'un eleve', sSupEleve === 200);

const { statut: sConnSuppr } = await appel('/auth/connexion', {
  method: 'POST',
  corps: { role: 'eleve', matricule: matricules[1] },
});
verifier('Matricule d\'un eleve supprime refuse (401)', sConnSuppr === 401);

// --- Suppression de la classe ---
const { statut: sSupClasse } = await appel(`/classes/${classe.id}`, {
  method: 'DELETE',
  token: t1,
});
verifier('Suppression de la classe', sSupClasse === 200);

const { statut: sConnClasseSuppr } = await appel('/auth/connexion', {
  method: 'POST',
  corps: { role: 'eleve', matricule: matricules[0] },
});
verifier('Eleve de la classe supprimee ne peut plus se connecter (401)', sConnClasseSuppr === 401);

const { data: dFinal } = await appel('/classes', { token: t1 });
verifier(
  `Il reste 1 classe (code ${codeUnique})`,
  dFinal.classes?.length === 1 && dFinal.classes[0].code === codeUnique
);

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
