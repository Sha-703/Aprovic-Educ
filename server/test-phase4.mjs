// Tests Phase 4-5 : devoirs QCM/ouverts + date de fin, archives, republiage
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

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const h = Date.now();
const codeClasse = `D${String(h % 10000).padStart(3, '0')}`;

// ==================== Mise en place ====================
const { statut: sInsc, data: insc } = await appel('/auth/inscription-enseignant', {
  method: 'POST',
  corps: { nom: 'Prof Devoirs', email: `p4${h}@t.test`, motDePasse: 'secret123', ecole: 'Lycee Phase4' },
});
verifier('Inscription enseignant (avec ecole)', sInsc === 201, insc.matricule);

const { data: conn } = await appel('/auth/connexion', {
  method: 'POST',
  corps: { role: 'enseignant', matricule: insc.matricule, motDePasse: 'secret123' },
});
const t1 = conn.token;

const { data: dClasse } = await appel('/classes', {
  method: 'POST',
  corps: { nom: '5eme D', niveau: '5eme', code: codeClasse },
  token: t1,
});
const cid = dClasse.classe.id;
verifier('Classe de test creee', !!cid, dClasse.classe.code);

const { data: dEleves } = await appel(`/classes/${cid}/eleves`, {
  method: 'POST',
  corps: { noms: ['Alice Devoir', 'Bob Devoir'] },
  token: t1,
});
const matA = dEleves.eleves[0].matricule;
const matB = dEleves.eleves[1].matricule;

const { data: connA } = await appel('/auth/connexion', {
  method: 'POST',
  corps: { role: 'eleve', matricule: matA },
});
const tA = connA.token;
const { data: connB } = await appel('/auth/connexion', {
  method: 'POST',
  corps: { role: 'eleve', matricule: matB },
});
const tB = connB.token;
verifier('Deux eleves connectes', !!tA && !!tB, `${matA} / ${matB}`);

// ==================== Creation d'un QCM ====================
const dateFuture = (ms) => new Date(Date.now() + ms).toISOString();

const { statut: sQcm, data: dQcm } = await appel(`/classes/${cid}/devoirs`, {
  method: 'POST',
  corps: {
    titre: 'QCM Geographie',
    type: 'qcm',
    consigne: 'Repondez a toutes les questions.',
    date_fin: dateFuture(3600 * 1000),
    note_max: 10,
    questions: [
      { enonce: 'Capitale de la France ?', choix: ['Paris', 'Lyon', 'Nice'], bonne_reponse: 0 },
      // Choix vide au milieu : l'index de la bonne reponse doit etre recalcule
      { enonce: 'Combien de continents ?', choix: ['Rome', '', 'Madrid'], bonne_reponse: 2 },
    ],
  },
  token: t1,
});
verifier('Creation QCM avec date de fin', sQcm === 201 && dQcm.devoir?.expire === false, dQcm.devoir?.titre);
const qcmId = dQcm.devoir?.id;

const { statut: sSansDate } = await appel(`/classes/${cid}/devoirs`, {
  method: 'POST',
  corps: { titre: 'Sans date', type: 'qcm', questions: [{ enonce: 'Q ?', choix: ['a', 'b'], bonne_reponse: 0 }] },
  token: t1,
});
verifier('Devoir sans date de fin refuse (400)', sSansDate === 400);

const { statut: sDatePassee } = await appel(`/classes/${cid}/devoirs`, {
  method: 'POST',
  corps: { titre: 'Depasse', type: 'ouvert', consigne: 'Texte', date_fin: dateFuture(-3600 * 1000) },
  token: t1,
});
verifier('Devoir avec date de fin passee refuse (400)', sDatePassee === 400);

// ==================== Cote eleve : le QCM ====================
const { statut: sListeA, data: dListeA } = await appel('/eleve/devoirs', { token: tA });
const qcmVue = dListeA.devoirs?.find((d) => d.id === qcmId);
verifier('Eleve voit le QCM actif', sListeA === 200 && qcmVue?.statut === 'a_faire');
verifier(
  'La bonne reponse est cachee avant rendu',
  qcmVue?.questions?.length === 2 && !('bonne_reponse' in qcmVue.questions[0]),
  JSON.stringify(qcmVue?.questions?.[1] ?? {})
);
verifier(
  'Choix vides filtres et index recalcule',
  JSON.stringify(qcmVue?.questions?.[1]?.choix) === JSON.stringify(['Rome', 'Madrid']),
  JSON.stringify(qcmVue?.questions?.[1]?.choix)
);

const { statut: sRendre, data: dRendre } = await appel(`/eleve/devoirs/${qcmId}/rendre`, {
  method: 'POST',
  corps: { reponse: [0, 0] }, // Q1 bonne, Q2 fausse
  token: tA,
});
verifier(
  'Rendu QCM : correction automatique envoyee',
  sRendre === 201 &&
    dRendre.resultat?.note === 5 &&
    dRendre.resultat?.bonnes === 1 &&
    dRendre.resultat?.total === 2 &&
    dRendre.resultat?.reussi === true,
  `${dRendre.resultat?.note}/${dRendre.resultat?.note_max}`
);
verifier(
  'Detail de correction fourni (bonne reponse incluse)',
  dRendre.correction?.[1]?.juste === false && dRendre.correction?.[1]?.bonne_reponse === 1
);

const { statut: sDouble } = await appel(`/eleve/devoirs/${qcmId}/rendre`, {
  method: 'POST',
  corps: { reponse: [1, 1] },
  token: tA,
});
verifier('Double rendu refuse (409)', sDouble === 409);

const { statut: sListeB, data: dListeB } = await appel('/eleve/devoirs', { token: tB });
verifier(
  'Deuxieme eleve : toujours a faire',
  dListeB.devoirs?.find((d) => d.id === qcmId)?.statut === 'a_faire',
  `statut ${sListeB}`
);

const { statut: sElevePost } = await appel(`/classes/${cid}/devoirs`, {
  method: 'POST',
  corps: { titre: 'Je triche', type: 'ouvert', consigne: 'x', date_fin: dateFuture(100000) },
  token: tA,
});
verifier('Un eleve ne peut pas creer de devoir (403)', sElevePost === 403);

// ==================== Cote enseignant : suivi ====================
const { statut: sSuivi, data: dSuivi } = await appel(`/classes/${cid}/devoirs/${qcmId}/rendus`, {
  token: t1,
});
const renduA = dSuivi.rendus?.find((r) => r.eleve.matricule === matA);
const renduB = dSuivi.rendus?.find((r) => r.eleve.matricule === matB);
verifier(
  'Suivi : eleve A rendu avec note, eleve B a faire',
  sSuivi === 200 && renduA?.statut === 'rendu' && renduA?.note === 5 && renduB?.statut === 'a_faire'
);
verifier('Correction du QCM visible par le enseignant', dSuivi.questions?.[0]?.bonne_reponse === 0);

const { statut: sCorrQcm } = await appel(`/rendus/${renduA.rendu_id}/corriger`, {
  method: 'PUT',
  corps: { note: 18, commentaire: 'non' },
  token: t1,
});
verifier('Correction manuelle interdite sur un QCM (400)', sCorrQcm === 400);

// ==================== Devoir ouvert ====================
const { statut: sOuvert, data: dOuvert } = await appel(`/classes/${cid}/devoirs`, {
  method: 'POST',
  corps: {
    titre: 'Dissertation',
    type: 'ouvert',
    consigne: 'Redigez un paragraphe sur la classe inversee.',
    date_fin: dateFuture(3600 * 1000),
    note_max: 20,
  },
  token: t1,
});
verifier('Creation devoir ouvert', sOuvert === 201, dOuvert.devoir?.titre);
const ouvertId = dOuvert.devoir.id;

const { statut: sTexteCourt } = await appel(`/eleve/devoirs/${ouvertId}/rendre`, {
  method: 'POST',
  corps: { reponse: 'court' },
  token: tA,
});
verifier('Reponse trop courte refusee (400)', sTexteCourt === 400);

const { statut: sTexte } = await appel(`/eleve/devoirs/${ouvertId}/rendre`, {
  method: 'POST',
  corps: { reponse: 'La classe inversee permet d apprendre chez soi puis de travailler en classe.' },
  token: tA,
});
verifier('Rendu devoir ouvert accepte', sTexte === 201 && sTexte !== undefined);

const { data: dSuiviO } = await appel(`/classes/${cid}/devoirs/${ouvertId}/rendus`, { token: t1 });
const renduOA = dSuiviO.rendus?.find((r) => r.eleve.matricule === matA);
verifier(
  'Enseignant voit la reponse redigee (en attente)',
  renduOA?.statut === 'rendu' && String(renduOA?.reponse).includes('classe inversee') && renduOA?.note === null
);

const { statut: sNoteKo } = await appel(`/rendus/${renduOA.rendu_id}/corriger`, {
  method: 'PUT',
  corps: { note: 25 },
  token: t1,
});
verifier('Note hors limites refusee (400)', sNoteKo === 400);

const { statut: sCorriger, data: dCorriger } = await appel(`/rendus/${renduOA.rendu_id}/corriger`, {
  method: 'PUT',
  corps: { note: 15, commentaire: 'Bon travail.' },
  token: t1,
});
verifier('Correction de l enseignant acceptee', sCorriger === 200 && dCorriger.rendu?.statut === 'corrige');

const { data: dListeApres } = await appel('/eleve/devoirs', { token: tA });
const ouvertVue = dListeApres.devoirs?.find((d) => d.id === ouvertId);
verifier(
  'Eleve voit sa note et le commentaire',
  ouvertVue?.statut === 'corrige' && ouvertVue?.mon_rendu?.note === 15 && ouvertVue?.mon_rendu?.commentaire === 'Bon travail.'
);

// ==================== Expiration d un devoir ====================
const { data: dCourt } = await appel(`/classes/${cid}/devoirs`, {
  method: 'POST',
  corps: { titre: 'Bientot termine', type: 'ouvert', consigne: 'A rendre vite.', date_fin: dateFuture(1200) },
  token: t1,
});
const courtId = dCourt.devoir.id;
await attendre(1600);

const { data: dApres } = await appel('/eleve/devoirs', { token: tA });
verifier(
  'Devoir expire efface pour l eleve',
  !dApres.devoirs.some((d) => d.id === courtId),
  `${dApres.devoirs.length} devoir(s) visibles`
);

const { data: dEnsListe } = await appel(`/classes/${cid}/devoirs`, { token: t1 });
const courtVue = dEnsListe.devoirs.find((d) => d.id === courtId);
verifier('Devoir expire archive pour l enseignant', courtVue?.expire === true);

const { data: dSuiviExp } = await appel(`/classes/${cid}/devoirs/${courtId}/rendus`, { token: t1 });
verifier(
  'Eleves non rendus marques manques apres echeance',
  dSuiviExp.rendus.every((r) => r.statut === 'manque'),
  dSuiviExp.rendus.map((r) => r.statut).join(', ')
);

const { statut: sTard } = await appel(`/eleve/devoirs/${courtId}/rendre`, {
  method: 'POST',
  corps: { reponse: 'Je rends trop tard.' },
  token: tA,
});
verifier('Rendu apres la date de fin refuse (400)', sTard === 400);

const { statut: sRep, data: dRep } = await appel(`/classes/${cid}/devoirs/${courtId}`, {
  method: 'PUT',
  corps: { date_fin: dateFuture(3600 * 1000) },
  token: t1,
});
verifier('Republiage du devoir (nouvelle date)', sRep === 200 && dRep.devoir?.expire === false);

const { data: dRevivre } = await appel('/eleve/devoirs', { token: tA });
verifier(
  'Devoir republie revisible par l eleve',
  dRevivre.devoirs.some((d) => d.id === courtId),
  `${dRevivre.devoirs.length} devoir(s) visibles`
);

// ==================== Expiration d un contenu ====================
const { statut: sConOk, data: dConOk } = await appel(`/classes/${cid}/contenus`, {
  method: 'POST',
  corps: {
    titre: 'Contenu ephemere',
    type: 'texte',
    corps: 'Ce contenu disparaitra.',
    date_fin: dateFuture(1000),
  },
  token: t1,
});
const conEph = dConOk.contenu.id;
verifier('Creation contenu avec date de fin', sConOk === 201 && dConOk.contenu?.expire === false);

const { statut: sConSansDate } = await appel(`/classes/${cid}/contenus`, {
  method: 'POST',
  corps: { titre: 'Sans echeance', type: 'texte', corps: 'texte' },
  token: t1,
});
verifier('Contenu sans date de fin refuse (400)', sConSansDate === 400);

const { statut: sConDuree, data: dConDuree } = await appel(`/classes/${cid}/contenus`, {
  method: 'POST',
  corps: { titre: 'Contenu durable', type: 'texte', corps: 'Celui-ci reste.', date_fin: dateFuture(3600 * 1000) },
  token: t1,
});
const conDure = dConDuree.contenu.id;
verifier('Creation contenu durable', sConDuree === 201);

await attendre(1300);

const { data: dMesApres } = await appel('/eleve/mes-contenus', { token: tA });
verifier(
  'Contenu expire efface pour l eleve',
  !dMesApres.contenus.some((c) => c.id === conEph) &&
    dMesApres.contenus.some((c) => c.id === conDure),
  `${dMesApres.contenus.length} contenu(s) visibles`
);

const { data: dConEns } = await appel(`/classes/${cid}/contenus`, { token: t1 });
verifier(
  'Contenu expire archive pour l enseignant',
  dConEns.contenus.find((c) => c.id === conEph)?.expire === true &&
    dConEns.contenus.find((c) => c.id === conDure)?.expire === false
);

const { statut: sConRep, data: dConRep } = await appel(`/classes/${cid}/contenus/${conEph}/republier`, {
  method: 'PUT',
  corps: { date_fin: dateFuture(3600 * 1000) },
  token: t1,
});
verifier('Contenu republie', sConRep === 200 && dConRep.contenu?.expire === false);

const { data: dMesRevivre } = await appel('/eleve/mes-contenus', { token: tA });
verifier(
  'Contenu republie revisible par l eleve',
  dMesRevivre.contenus.some((c) => c.id === conEph),
  `${dMesRevivre.contenus.length} contenu(s)`
);

// ==================== Securite croisee ====================
const { statut: sAutre, data: dAutre } = await appel('/auth/inscription-enseignant', {
  method: 'POST',
  corps: { nom: 'Autre Prof', email: `p4b${h}@t.test`, motDePasse: 'secret123', ecole: 'College B' },
});
const { data: connAutre } = await appel('/auth/connexion', {
  method: 'POST',
  corps: { role: 'enseignant', matricule: dAutre.matricule, motDePasse: 'secret123' },
});
const { statut: sClasseEtrangere } = await appel(`/classes/${cid}/devoirs`, {
  token: connAutre.token,
});
verifier(
  "Un autre enseignant n'a pas acces aux devoirs de la classe (404)",
  sInsc === 201 && sAutre === 201 && sClasseEtrangere === 404,
  `${sAutre} / ${sClasseEtrangere}`
);

const { statut: sAccesCroise } = await appel(`/classes/${cid}/devoirs`, {
  token: 'jeton-invalide',
});
verifier('Acces sans jeton valide refuse (401)', sAccesCroise === 401);

const { statut: sEleveSuivi } = await appel(`/classes/${cid}/devoirs/${qcmId}/rendus`, { token: tA });
verifier('Un eleve ne voit pas le suivi des rendus (403)', sEleveSuivi === 403);

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
