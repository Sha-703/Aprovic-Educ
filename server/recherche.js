import { Router } from 'express';
import { db } from './db.js';
import { requireAuth, requireRole } from './security.js';
import { capterErreurs } from './erreurs.js';

const router = capterErreurs(Router());

/** Motif LIKE : caracteres speciaux (\ % _) neutralises via ESCAPE '\'. */
function motif(mot) {
  return `%${mot.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const LIMITE = 5;

/**
 * GET /api/recherche?q=mot — recherche globale de l'application.
 * Enseignant : ses classes, ses eleves, ses devoirs, ses contenus.
 * Eleve : les contenus et devoirs encore visibles de sa classe.
 */
router.get('/', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return res.status(400).json({ erreur: 'Saisissez au moins 2 caracteres.' });
  }
  const m = motif(q);
  const vide = { classes: [], eleves: [], devoirs: [], contenus: [] };

  if (req.auth.role === 'enseignant') {
    const [classes, eleves, devoirs, contenus] = await Promise.all([
      db
        .prepare(
          `SELECT id, nom, code, niveau, option_classe
           FROM classes
           WHERE enseignant_id = ?
             AND (nom LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\')
           ORDER BY nom LIMIT ${LIMITE}`
        )
        .all(req.auth.id, m, m),
      db
        .prepare(
          `SELECT u.id, u.nom, u.matricule, c.id AS classe_id, c.nom AS classe_nom
           FROM users u
           JOIN classes c ON c.id = u.classe_id
           WHERE u.role = 'eleve' AND c.enseignant_id = ?
             AND (u.nom LIKE ? ESCAPE '\\' OR u.matricule LIKE ? ESCAPE '\\')
           ORDER BY u.nom LIMIT ${LIMITE}`
        )
        .all(req.auth.id, m, m),
      db
        .prepare(
          `SELECT d.id, d.titre, d.type, d.date_fin, d.classe_id, c.nom AS classe_nom
           FROM devoirs d
           JOIN classes c ON c.id = d.classe_id
           WHERE c.enseignant_id = ? AND d.titre LIKE ? ESCAPE '\\'
           ORDER BY d.date_fin DESC LIMIT ${LIMITE}`
        )
        .all(req.auth.id, m),
      db
        .prepare(
          `SELECT ct.id, ct.titre, ct.type, ct.date_fin, ct.classe_id, c.nom AS classe_nom
           FROM contenus ct
           JOIN classes c ON c.id = ct.classe_id
           WHERE c.enseignant_id = ? AND ct.titre LIKE ? ESCAPE '\\'
           ORDER BY ct.cree_le DESC LIMIT ${LIMITE}`
        )
        .all(req.auth.id, m),
    ]);
    return res.json({ classes, eleves, devoirs, contenus });
  }

  // Eleve : uniquement ce qu'il peut vraiment voir (meme filtres que ses listes)
  const moi = await db.prepare('SELECT classe_id FROM users WHERE id = ?').get(req.auth.id);
  if (!moi || !moi.classe_id) return res.json(vide);

  const maintenant = new Date().toISOString();
  const [devoirs, contenus] = await Promise.all([
    db
      .prepare(
        `SELECT d.id, d.titre, d.type, d.date_fin, d.classe_id, c.nom AS classe_nom
         FROM devoirs d
         JOIN classes c ON c.id = d.classe_id
         WHERE d.classe_id = ? AND d.date_fin > ? AND d.titre LIKE ? ESCAPE '\\'
         ORDER BY d.date_fin LIMIT ${LIMITE}`
      )
      .all(moi.classe_id, maintenant, m),
    db
      .prepare(
        `SELECT ct.id, ct.titre, ct.type, ct.date_fin, ct.classe_id, c.nom AS classe_nom
         FROM contenus ct
         JOIN classes c ON c.id = ct.classe_id
         WHERE ct.classe_id = ? AND (ct.date_fin IS NULL OR ct.date_fin > ?)
           AND ct.titre LIKE ? ESCAPE '\\'
         ORDER BY ct.cree_le DESC LIMIT ${LIMITE}`
      )
      .all(moi.classe_id, maintenant, m),
  ]);
  return res.json({ ...vide, devoirs, contenus });
});

/**
 * GET /api/recherche/eleve/:matricule — fiche complete d'un eleve :
 * sa classe, tous ses devoirs (rendus / a faire / manques + notes) et
 * ses performances de connexion.
 */
router.get('/eleve/:matricule', requireAuth, requireRole('enseignant'), async (req, res) => {
  const eleve = await db
    .prepare(
      `SELECT u.id, u.nom, u.matricule,
              c.id AS classe_id, c.nom AS classe_nom, c.niveau, c.option_classe, c.code
       FROM users u
       JOIN classes c ON c.id = u.classe_id
       WHERE u.role = 'eleve' AND u.matricule = ? AND c.enseignant_id = ?`
    )
    .get(String(req.params.matricule), req.auth.id);
  if (!eleve) return res.status(404).json({ erreur: 'Eleve introuvable.' });

  // Tous les devoirs de sa classe + son rendu éventuel (LEFT JOIN)
  const lignes = await db
    .prepare(
      `SELECT d.id, d.titre, d.type, d.date_fin, d.note_max,
              r.note, r.commentaire, r.statut AS rendu_statut, r.soumis_le
       FROM devoirs d
       LEFT JOIN rendus r ON r.devoir_id = d.id AND r.eleve_id = ?
       WHERE d.classe_id = ?
       ORDER BY d.date_fin DESC`
    )
    .all(eleve.id, eleve.classe_id);

  const maintenant = Date.now();
  const devoirs = lignes.map((d) => ({
    ...d,
    statut: d.rendu_statut
      ? d.rendu_statut // rendu | corrige
      : new Date(d.date_fin).getTime() <= maintenant
        ? 'manque' // pas rendu apres l'echeance
        : 'a_faire',
  }));

  // Performances : memes regles que /presence/eleves
  const presences = await db
    .prepare('SELECT debut, derniere_activite FROM presences WHERE user_id = ?')
    .all(eleve.id);
  let secondes = 0;
  let derniere = null;
  for (const p of presences) {
    secondes += Math.max(0, (new Date(p.derniere_activite) - new Date(p.debut)) / 1000);
    if (!derniere || p.derniere_activite > derniere) derniere = p.derniere_activite;
  }

  res.json({
    eleve: { id: eleve.id, nom: eleve.nom, matricule: eleve.matricule },
    classe: {
      id: eleve.classe_id,
      nom: eleve.classe_nom,
      niveau: eleve.niveau,
      option_classe: eleve.option_classe,
      code: eleve.code,
    },
    devoirs,
    performances: {
      nb_connexions: presences.length,
      secondes: Math.round(secondes),
      derniere_activite: derniere,
      en_ligne: derniere
        ? (Date.now() - new Date(derniere).getTime()) / 1000 < 120
        : false,
    },
  });
});

/**
 * GET /api/recherche/classe/:id — fiche d'une classe : niveau, option,
 * effectif (liste des eleves) et compteurs de devoirs/contenus en cours.
 */
router.get('/classe/:id', requireAuth, requireRole('enseignant'), async (req, res) => {
  const classe = await db
    .prepare(
      `SELECT id, nom, code, niveau, option_classe
       FROM classes WHERE id = ? AND enseignant_id = ?`
    )
    .get(Number(req.params.id), req.auth.id);
  if (!classe) return res.status(404).json({ erreur: 'Classe introuvable.' });

  const eleves = await db
    .prepare(
      `SELECT id, nom, matricule FROM users
       WHERE classe_id = ? AND role = 'eleve' ORDER BY nom`
    )
    .all(classe.id);

  const maintenant = new Date().toISOString();
  const [devoirs, contenus] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM devoirs
         WHERE classe_id = ? AND date_fin > ?`
      )
      .get(classe.id, maintenant),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM contenus
         WHERE classe_id = ? AND (date_fin IS NULL OR date_fin > ?)`
      )
      .get(classe.id, maintenant),
  ]);

  res.json({
    classe,
    eleves,
    nb_devoirs: Number(devoirs?.n || 0),
    nb_contenus: Number(contenus?.n || 0),
  });
});

export default router;
