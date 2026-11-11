import { Router } from 'express';
import { db } from './db.js';
import { requireAuth } from './security.js';
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

export default router;
