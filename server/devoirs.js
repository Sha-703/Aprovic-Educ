import { Router } from 'express';
import { db } from './db.js';
import { requireAuth, requireRole } from './security.js';
import { classeDemandee } from './classes.js';

const autorise = [requireAuth, requireRole('enseignant')];

function dateValide(v) {
  return v && !Number.isNaN(new Date(v).getTime());
}

function expire(devoir) {
  return new Date(devoir.date_fin).getTime() <= Date.now();
}

function publierDevoir(d) {
  return {
    id: d.id,
    titre: d.titre,
    type: d.type,
    consigne: d.consigne,
    date_fin: d.date_fin,
    note_max: d.note_max,
    cree_le: d.cree_le,
    expire: expire(d),
  };
}

function chargerQuestions(devoirId, cacherCorrige) {
  const questions = db
    .prepare('SELECT * FROM questions WHERE devoir_id = ? ORDER BY id')
    .all(devoirId);
  return questions.map((q) => {
    const base = { id: q.id, enonce: q.enonce, choix: JSON.parse(q.choix) };
    // La bonne reponse n'est donnee a l'eleve qu'apres son rendu
    return cacherCorrige ? base : { ...base, bonne_reponse: q.bonne_reponse };
  });
}

/* ==================== Enseignant ==================== */
export const routerDevoirsEnseignant = Router();

// POST /api/classes/:id/devoirs — creer un devoir (QCM ou ouvert) avec date de fin
routerDevoirsEnseignant.post('/classes/:id/devoirs', ...autorise, (req, res) => {
  const classe = classeDemandee(req, res);
  if (!classe) return;

  const { titre, type, consigne = '', date_fin, note_max, questions } = req.body || {};

  if (!titre || String(titre).trim().length < 2) {
    return res.status(400).json({ erreur: 'Le titre est requis (2 caracteres min).' });
  }
  if (type !== 'qcm' && type !== 'ouvert') {
    return res.status(400).json({ erreur: 'Type de devoir invalide (qcm ou ouvert).' });
  }
  if (!dateValide(date_fin)) {
    return res.status(400).json({ erreur: 'La date de fin est requise.' });
  }
  if (new Date(date_fin).getTime() <= Date.now()) {
    return res.status(400).json({ erreur: 'La date de fin doit etre dans le futur.' });
  }
  const noteMax = Number(note_max) > 0 ? Number(note_max) : 20;

  if (type === 'ouvert' && !String(consigne).trim()) {
    return res.status(400).json({ erreur: 'La consigne est requise pour un devoir ouvert.' });
  }

  let listeQuestions = [];
  if (type === 'qcm') {
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ erreur: 'Ajoutez au moins une question au QCM.' });
    }
    for (const q of questions) {
      const brut = Array.isArray(q.choix) ? q.choix : [];
      const paires = brut
        .map((c, i) => ({ texte: String(c).trim(), i }))
        .filter((p) => p.texte);
      const choix = paires.map((p) => p.texte);
      const posBonne = paires.findIndex((p) => p.i === Number(q.bonne_reponse));
      if (!q.enonce || String(q.enonce).trim().length < 2) {
        return res.status(400).json({ erreur: 'Chaque question doit avoir un enonce.' });
      }
      if (choix.length < 2) {
        return res.status(400).json({ erreur: 'Chaque question doit avoir au moins 2 choix.' });
      }
      if (posBonne < 0) {
        return res.status(400).json({ erreur: 'Indiquez la bonne reponse de chaque question.' });
      }
      listeQuestions.push({
        enonce: String(q.enonce).trim().slice(0, 500),
        choix,
        bonne_reponse: posBonne,
      });
    }
  }

  const resultat = db
    .prepare(
      `INSERT INTO devoirs (classe_id, enseignant_id, titre, type, consigne, date_fin, note_max)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      classe.id,
      req.auth.id,
      String(titre).trim().slice(0, 200),
      type,
      String(consigne).slice(0, 50000),
      new Date(date_fin).toISOString(),
      noteMax
    );

  const insQuestion = db.prepare(
    'INSERT INTO questions (devoir_id, enonce, choix, bonne_reponse) VALUES (?, ?, ?, ?)'
  );
  for (const q of listeQuestions) {
    insQuestion.run(resultat.lastInsertRowid, q.enonce, JSON.stringify(q.choix), q.bonne_reponse);
  }

  const devoir = db.prepare('SELECT * FROM devoirs WHERE id = ?').get(resultat.lastInsertRowid);
  res.status(201).json({ devoir: publierDevoir(devoir) });
});

// GET /api/classes/:id/devoirs — tous les devoirs (actifs + archives)
routerDevoirsEnseignant.get('/classes/:id/devoirs', ...autorise, (req, res) => {
  const classe = classeDemandee(req, res);
  if (!classe) return;

  const devoirs = db
    .prepare(
      `SELECT d.*,
              (SELECT COUNT(*) FROM rendus r WHERE r.devoir_id = d.id) AS nb_rendus
       FROM devoirs d
       WHERE d.classe_id = ?
       ORDER BY d.date_fin DESC`
    )
    .all(classe.id)
    .map((d) => ({
      ...publierDevoir(d),
      nb_rendus: d.nb_rendus,
      nb_eleves: db
        .prepare("SELECT COUNT(*) AS n FROM users WHERE classe_id = ? AND role = 'eleve'")
        .get(classe.id).n,
    }));

  res.json({ devoirs });
});

// PUT /api/classes/:id/devoirs/:did — republier (nouvelle date de fin) ou modifier
routerDevoirsEnseignant.put('/classes/:id/devoirs/:did', ...autorise, (req, res) => {
  const classe = classeDemandee(req, res);
  if (!classe) return;

  const devoir = db
    .prepare('SELECT * FROM devoirs WHERE id = ? AND classe_id = ?')
    .get(Number(req.params.did), classe.id);
  if (!devoir) return res.status(404).json({ erreur: 'Devoir introuvable.' });

  const { date_fin, titre, consigne } = req.body || {};

  if (date_fin !== undefined) {
    if (!dateValide(date_fin)) {
      return res.status(400).json({ erreur: 'Date de fin invalide.' });
    }
    db.prepare('UPDATE devoirs SET date_fin = ? WHERE id = ?').run(
      new Date(date_fin).toISOString(),
      devoir.id
    );
  }
  if (titre !== undefined) {
    if (String(titre).trim().length < 2) {
      return res.status(400).json({ erreur: 'Titre trop court.' });
    }
    db.prepare('UPDATE devoirs SET titre = ? WHERE id = ?').run(
      String(titre).trim().slice(0, 200),
      devoir.id
    );
  }
  if (consigne !== undefined) {
    db.prepare('UPDATE devoirs SET consigne = ? WHERE id = ?').run(
      String(consigne).slice(0, 50000),
      devoir.id
    );
  }

  const maj = db.prepare('SELECT * FROM devoirs WHERE id = ?').get(devoir.id);
  res.json({
    message: 'Devoir republie.',
    devoir: publierDevoir(maj),
  });
});

// DELETE /api/classes/:id/devoirs/:did
routerDevoirsEnseignant.delete('/classes/:id/devoirs/:did', ...autorise, (req, res) => {
  const classe = classeDemandee(req, res);
  if (!classe) return;

  const devoir = db
    .prepare('SELECT * FROM devoirs WHERE id = ? AND classe_id = ?')
    .get(Number(req.params.did), classe.id);
  if (!devoir) return res.status(404).json({ erreur: 'Devoir introuvable.' });

  db.prepare('DELETE FROM devoirs WHERE id = ?').run(devoir.id);
  res.json({ message: `Devoir "${devoir.titre}" supprime.` });
});

// GET /api/classes/:id/devoirs/:did/rendus — suivi complet (avec les "manques")
routerDevoirsEnseignant.get('/classes/:id/devoirs/:did/rendus', ...autorise, (req, res) => {
  const classe = classeDemandee(req, res);
  if (!classe) return;

  const devoir = db
    .prepare('SELECT * FROM devoirs WHERE id = ? AND classe_id = ?')
    .get(Number(req.params.did), classe.id);
  if (!devoir) return res.status(404).json({ erreur: 'Devoir introuvable.' });

  const eleves = db
    .prepare(
      "SELECT id, nom, matricule FROM users WHERE classe_id = ? AND role = 'eleve' ORDER BY nom"
    )
    .all(classe.id);

  const rendus = db
    .prepare(
      `SELECT r.*, u.nom AS eleve_nom, u.matricule AS eleve_matricule
       FROM rendus r JOIN users u ON u.id = r.eleve_id
       WHERE r.devoir_id = ?`
    )
    .all(devoir.id);

  const parEleve = new Map(rendus.map((r) => [r.eleve_id, r]));
  const estExpire = expire(devoir);

  const liste = eleves.map((e) => {
    const r = parEleve.get(e.id);
    if (r) {
      return {
        rendu_id: r.id,
        eleve: { id: e.id, nom: e.nom, matricule: e.matricule },
        statut: r.statut,
        reponse: r.reponse,
        note: r.note,
        commentaire: r.commentaire,
        soumis_le: r.soumis_le,
      };
    }
    return {
      rendu_id: null,
      eleve: { id: e.id, nom: e.nom, matricule: e.matricule },
      statut: estExpire ? 'manque' : 'a_faire',
      reponse: null,
      note: null,
      commentaire: null,
      soumis_le: null,
    };
  });

  res.json({
    devoir: publierDevoir(devoir),
    rendus: liste,
    questions: devoir.type === 'qcm' ? chargerQuestions(devoir.id, false) : [],
  });
});

// PUT /api/rendus/:rid/corriger — correction d'un devoir ouvert par l'enseignant
routerDevoirsEnseignant.put('/rendus/:rid/corriger', ...autorise, (req, res) => {
  const rendu = db
    .prepare(
      `SELECT r.*, d.type AS devoir_type, d.note_max, d.classe_id
       FROM rendus r JOIN devoirs d ON d.id = r.devoir_id
       WHERE r.id = ?`
    )
    .get(Number(req.params.rid));
  if (!rendu) return res.status(404).json({ erreur: 'Rendu introuvable.' });

  const classe = db
    .prepare('SELECT id FROM classes WHERE id = ? AND enseignant_id = ?')
    .get(rendu.classe_id, req.auth.id);
  if (!classe) return res.status(404).json({ erreur: 'Rendu introuvable.' });

  if (rendu.devoir_type !== 'ouvert') {
    return res.status(400).json({ erreur: 'Les QCM sont corriges automatiquement.' });
  }

  const { note, commentaire = '' } = req.body || {};
  const noteNum = Number(note);
  if (Number.isNaN(noteNum) || noteNum < 0 || noteNum > rendu.note_max) {
    return res.status(400).json({ erreur: `La note doit etre entre 0 et ${rendu.note_max}.` });
  }

  db.prepare(
    "UPDATE rendus SET note = ?, commentaire = ?, statut = 'corrige' WHERE id = ?"
  ).run(noteNum, String(commentaire).slice(0, 2000), rendu.id);

  const maj = db.prepare('SELECT * FROM rendus WHERE id = ?').get(rendu.id);
  res.json({ message: 'Devoir corrige.', rendu: maj });
});

/* ==================== Eleve ==================== */
export const routerDevoirsEleve = Router();
routerDevoirsEleve.use(requireAuth, requireRole('eleve'));

// GET /api/eleve/devoirs — devoirs en cours de ma classe (expire = efface)
routerDevoirsEleve.get('/devoirs', (req, res) => {
  const eleve = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.id);
  if (!eleve.classe_id) return res.json({ devoirs: [] });

  const maintenant = new Date().toISOString();
  const devoirs = db
    .prepare(
      'SELECT * FROM devoirs WHERE classe_id = ? AND date_fin > ? ORDER BY date_fin'
    )
    .all(eleve.classe_id, maintenant);

  const resultat = devoirs.map((d) => {
    const rendu = db
      .prepare('SELECT * FROM rendus WHERE devoir_id = ? AND eleve_id = ?')
      .get(d.id, eleve.id);
    const dejaRendu = !!rendu;
    return {
      ...publierDevoir(d),
      statut: rendu ? rendu.statut : 'a_faire',
      mon_rendu: rendu
        ? {
            reponse: rendu.reponse,
            note: rendu.note,
            commentaire: rendu.commentaire,
            soumis_le: rendu.soumis_le,
          }
        : null,
      questions:
        d.type === 'qcm'
          ? chargerQuestions(d.id, !dejaRendu) // bonne reponse cachee tant que non rendu
          : [],
    };
  });

  res.json({ devoirs: resultat });
});

// POST /api/eleve/devoirs/:did/rendre — soumettre sa reponse avant la date de fin
routerDevoirsEleve.post('/devoirs/:did/rendre', (req, res) => {
  const eleve = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.id);
  const devoir = db
    .prepare('SELECT * FROM devoirs WHERE id = ?')
    .get(Number(req.params.did));

  if (!devoir || devoir.classe_id !== eleve.classe_id) {
    return res.status(404).json({ erreur: 'Devoir introuvable.' });
  }
  if (new Date(devoir.date_fin).getTime() <= Date.now()) {
    return res.status(400).json({ erreur: 'La date de fin est depassee : devoir non accepte.' });
  }
  const deja = db
    .prepare('SELECT id FROM rendus WHERE devoir_id = ? AND eleve_id = ?')
    .get(devoir.id, eleve.id);
  if (deja) {
    return res.status(409).json({ erreur: 'Vous avez deja rendu ce devoir.' });
  }

  const { reponse } = req.body || {};

  // ---- QCM : correction automatique ----
  if (devoir.type === 'qcm') {
    const questions = db
      .prepare('SELECT * FROM questions WHERE devoir_id = ? ORDER BY id')
      .all(devoir.id);

    if (!Array.isArray(reponse) || reponse.length !== questions.length) {
      return res.status(400).json({ erreur: 'Veuillez repondre a toutes les questions.' });
    }

    let bonnes = 0;
    const correction = questions.map((q, i) => {
      const choix = JSON.parse(q.choix);
      const choisi = Number(reponse[i]);
      const valide =
        Number.isInteger(choisi) && choisi >= 0 && choisi < choix.length && choisi === q.bonne_reponse;
      if (valide) bonnes += 1;
      return {
        enonce: q.enonce,
        choix,
        bonne_reponse: q.bonne_reponse,
        reponse_choisie: Number.isInteger(choisi) && choisi >= 0 && choisi < choix.length ? choisi : null,
        juste: valide,
      };
    });

    const note = Math.round((bonnes / questions.length) * devoir.note_max * 100) / 100;
    const reponseJson = JSON.stringify(reponse.map((r) => Number(r)));

    db.prepare(
      "INSERT INTO rendus (devoir_id, eleve_id, reponse, note, statut) VALUES (?, ?, ?, ?, 'rendu')"
    ).run(devoir.id, eleve.id, reponseJson, note);

    return res.status(201).json({
      message: 'Devoir rendu.',
      resultat: {
        note,
        note_max: devoir.note_max,
        bonnes,
        total: questions.length,
        reussi: note >= devoir.note_max / 2,
      },
      correction,
    });
  }

  // ---- Devoir ouvert : réponse rédigée, correction par l'enseignant ----
  const texte = String(reponse ?? '').trim();
  if (texte.length < 10) {
    return res.status(400).json({ erreur: 'Votre reponse est trop courte (10 caracteres min).' });
  }

  db.prepare(
    "INSERT INTO rendus (devoir_id, eleve_id, reponse, statut) VALUES (?, ?, ?, 'rendu')"
  ).run(devoir.id, eleve.id, texte.slice(0, 50000));

  res.status(201).json({
    message: 'Devoir soumis. En attente de correction par votre enseignant.',
    resultat: null,
  });
});
