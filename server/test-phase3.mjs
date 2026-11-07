// Tests Phase 3 : contenus (texte/video/pdf/fichier) + presence/temps passe
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

async function upload(chemin, formData, token) {
  const res = await fetch(BASE + chemin, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  return { statut: res.status, data };
}

const h = Date.now();
// Code unique a chaque execution (tests relancables)
const codeClasseTest = `T${String(h % 100000)}`;

// --- Comptes ---
const { data: insc } = await appel('/auth/inscription-enseignant', {
  method: 'POST',
  corps: { nom: 'Prof Test', email: `p3${h}@t.test`, motDePasse: 'secret123', ecole: 'Lycee Phase3' },
});
const { data: conn } = await appel('/auth/connexion', {
  method: 'POST',
  corps: { role: 'enseignant', matricule: insc.matricule, motDePasse: 'secret123' },
});
const t1 = conn.token;

const { data: classe } = await appel('/classes', {
  method: 'POST',
  corps: { nom: '4eme C', code: codeClasseTest },
  token: t1,
});
const cid = classe.classe.id;

const { data: dEleves } = await appel(`/classes/${cid}/eleves`, {
  method: 'POST',
  corps: { noms: ['Test Eleve'] },
  token: t1,
});
const matriculeEleve = dEleves.eleves[0].matricule;

const { data: connE } = await appel('/auth/connexion', {
  method: 'POST',
  corps: { role: 'eleve', matricule: matriculeEleve },
});
const te = connE.token;
verifier('Enseignant + eleve connectes', !!t1 && !!te);

// --- Regression Phase 2 : espace eleve ---
const { statut: sClasse, data: dClasse } = await appel('/eleve/ma-classe', { token: te });
verifier(
  'REGRESSION — /eleve/ma-classe fonctionne',
  sClasse === 200 && dClasse.classe?.nom === '4eme C',
  `${dClasse.classe?.nom} · ${dClasse.enseignant}`
);

// --- Contenus : texte ---
const { statut: sTexte, data: dTexte } = await appel(`/classes/${cid}/contenus`, {
  method: 'POST',
  corps: {
    titre: 'Le passe compose',
    type: 'texte',
    corps: "J'ai mange.\nIl a vu.",
    date_fin: new Date(h + 7 * 24 * 3600 * 1000).toISOString(),
  },
  token: t1,
});
verifier('Creation contenu texte', sTexte === 201 && dTexte.contenu?.type === 'texte');

// --- Contenus : video par URL ---
const { statut: sVideo, data: dVideo } = await appel(`/classes/${cid}/contenus`, {
  method: 'POST',
  corps: {
    titre: 'Video conjugaison',
    type: 'video',
    url: 'https://www.youtube.com/watch?v=abc123def',
    date_fin: new Date(h + 7 * 24 * 3600 * 1000).toISOString(),
  },
  token: t1,
});
verifier('Creation contenu video (URL)', sVideo === 201 && !!dVideo.contenu?.url);

const { statut: sVideoKo } = await appel(`/classes/${cid}/contenus`, {
  method: 'POST',
  corps: { titre: 'Video KO', type: 'video', url: 'ftp://mauvais' },
  token: t1,
});
verifier('URL video invalide refusee (400)', sVideoKo === 400);

// --- Contenus : upload PDF ---
const fdPdf = new FormData();
fdPdf.append('titre', 'Fiche de cours');
fdPdf.append('type', 'pdf');
fdPdf.append('date_fin', new Date(h + 7 * 24 * 3600 * 1000).toISOString());
fdPdf.append('fichier', new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' }), 'fiche.pdf');
const sPdf = await upload(`/classes/${cid}/contenus`, fdPdf, t1);
verifier(
  'Upload PDF',
  sPdf.statut === 201 && String(sPdf.data.contenu?.url || '').startsWith('/uploads/'),
  sPdf.data.contenu?.url
);

// Telechargement du fichier depose
if (sPdf.statut === 201) {
  const fichier = await fetch('http://localhost:3001' + sPdf.data.contenu.url);
  verifier('Fichier PDF accessible via /uploads/', fichier.status === 200);
}

// --- Contenus : validations ---
const fdKo = new FormData();
fdKo.append('titre', 'PDF KO');
fdKo.append('type', 'pdf');
const sPdfKo = await upload(`/classes/${cid}/contenus`, fdKo, t1);
verifier('PDF sans fichier refuse (400)', sPdfKo.statut === 400);

const fdExe = new FormData();
fdExe.append('titre', 'Virus');
fdExe.append('type', 'fichier');
fdExe.append('fichier', new Blob(['MZ'], { type: 'application/octet-stream' }), 'virus.exe');
const sExe = await upload(`/classes/${cid}/contenus`, fdExe, t1);
verifier('Fichier .exe refuse (400)', sExe.statut === 400);

const sType = await appel(`/classes/${cid}/contenus`, {
  method: 'POST',
  corps: { titre: 'N importe', type: 'chanson' },
  token: t1,
});
verifier('Type invalide refuse (400)', sType.statut === 400);

// --- Liste enseignant ---
const { data: dListe } = await appel(`/classes/${cid}/contenus`, { token: t1 });
verifier('Liste contenus enseignant (3)', dListe.contenus?.length === 3, `${dListe.contenus?.length}`);

// --- Cote eleve ---
const { statut: sMes, data: dMes } = await appel('/eleve/mes-contenus', { token: te });
verifier(
  'Eleve voit les 3 contenus de sa classe',
  sMes === 200 && dMes.contenus?.length === 3 && dMes.classe?.nom === '4eme C',
  `${dMes.contenus?.length} contenu(s)`
);

const { statut: sElevePost } = await appel(`/classes/${cid}/contenus`, {
  method: 'POST',
  corps: { titre: 'Moi aussi', type: 'texte', corps: 'essai' },
  token: te,
});
verifier('Un eleve ne peut pas publier de contenu (403)', sElevePost === 403);

// --- Suppression contenu + fichier ---
const { statut: sSup } = await appel(`/classes/${cid}/contenus/${sPdf.data.contenu.id}`, {
  method: 'DELETE',
  token: t1,
});
verifier('Suppression du contenu PDF', sSup === 200);
if (sSup === 201 || sSup === 200) {
  const apres = await fetch('http://localhost:3001' + sPdf.data.contenu.url);
  verifier('Fichier supprime du disque', apres.status === 404, `statut ${apres.status}`);
}

// --- Presence / temps passe ---
const p1 = await appel('/presence', { method: 'POST', token: te });
verifier('Heartbeat eleve (nouvelle session)', p1.statut === 200 && p1.data.session === 'nouvelle');

const p2 = await appel('/presence', { method: 'POST', token: te });
verifier('Heartbeat eleve (session continue)', p2.statut === 200 && p2.data.session === 'continue');

const pProf = await appel('/presence', { method: 'POST', token: t1 });
verifier('Heartbeat enseignant', pProf.statut === 200);

const { statut: sStats, data: dStats } = await appel('/presence/eleves', { token: t1 });
const trouve = (dStats.eleves || []).find((e) => e.matricule === matriculeEleve);
verifier(
  'Stats enseignant : eleve presente avec sessions + temps',
  sStats === 200 &&
    !!trouve &&
    trouve.nb_connexions >= 1 &&
    trouve.secondes >= 0 &&
    trouve.en_ligne === true,
  trouve
    ? `${trouve.nom} · ${trouve.nb_connexions} session(s) · ${trouve.secondes}s · en_ligne=${trouve.en_ligne}`
    : 'eleve absent'
);

const { statut: sStatsEleve } = await appel('/presence/eleves', { token: te });
verifier('Un eleve ne peut pas voir les stats (403)', sStatsEleve === 403);

// --- Regression : eleve bloque sur les routes enseignant ---
const { statut: sBloque } = await appel('/classes', { token: te });
verifier('REGRESSION — eleve bloque sur /classes (403)', sBloque === 403);

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
