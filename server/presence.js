import { db } from './db.js';
import { requireAuth, requireRole } from './security.js';
import { routerProtege } from './erreurs.js';

export const routerPresence = routerProtege();

// Une session = periode active. Si plus de 10 min sans heartbeat, nouvelle session.
const SEUIL_SESSION = 10 * 60;
// Eleve considere "en ligne" s'il a un heartbeat depuis moins de 2 min
const SEUIL_EN_LIGNE = 120;

// POST /api/presence — heartbeat envoye par la PWA toutes les 30 s
routerPresence.post('/presence', requireAuth, async (req, res) => {
  const maintenant = new Date();
  const iso = maintenant.toISOString();

  const derniere = await db
    .prepare('SELECT * FROM presences WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(req.auth.id);

  if (derniere) {
    const ecart = (maintenant - new Date(derniere.derniere_activite)) / 1000;
    if (ecart < SEUIL_SESSION) {
      await db.prepare('UPDATE presences SET derniere_activite = ? WHERE id = ?').run(iso, derniere.id);
      return res.json({ ok: true, session: 'continue' });
    }
  }

  await db.prepare('INSERT INTO presences (user_id, debut, derniere_activite) VALUES (?, ?, ?)').run(
    req.auth.id,
    iso,
    iso
  );
  res.json({ ok: true, session: 'nouvelle' });
});

// GET /api/presence/eleves — stats de connexion de tous les eleves de l'enseignant
routerPresence.get('/presence/eleves', requireAuth, requireRole('enseignant'), async (req, res) => {
  const eleves = await db
    .prepare(
      `SELECT u.id, u.nom, u.matricule, c.id AS classe_id, c.nom AS classe_nom
       FROM users u
       JOIN classes c ON c.id = u.classe_id
       WHERE u.role = 'eleve' AND c.enseignant_id = ?
       ORDER BY c.nom, u.nom`
    )
    .all(req.auth.id);

  const ids = eleves.map((e) => e.id);
  const presences =
    ids.length > 0
      ? await db
          .prepare(
            `SELECT user_id, debut, derniere_activite FROM presences
             WHERE user_id IN (${ids.map(() => '?').join(',')})`
          )
          .all(...ids)
      : [];

  const parEleve = new Map();
  for (const p of presences) {
    const duree = (new Date(p.derniere_activite) - new Date(p.debut)) / 1000;
    const stat = parEleve.get(p.user_id) || { secondes: 0, nb: 0, derniere: null };
    stat.secondes += Math.max(0, duree);
    stat.nb += 1;
    if (!stat.derniere || p.derniere_activite > stat.derniere) stat.derniere = p.derniere_activite;
    parEleve.set(p.user_id, stat);
  }

  const maintenant = Date.now();
  const resultat = eleves.map((e) => {
    const stat = parEleve.get(e.id) || { secondes: 0, nb: 0, derniere: null };
    const enLigne = stat.derniere
      ? (maintenant - new Date(stat.derniere).getTime()) / 1000 < SEUIL_EN_LIGNE
      : false;
    return {
      id: e.id,
      nom: e.nom,
      matricule: e.matricule,
      classe: { id: e.classe_id, nom: e.classe_nom },
      nb_connexions: stat.nb,
      secondes: Math.round(stat.secondes),
      derniere_activite: stat.derniere,
      en_ligne: enLigne,
    };
  });

  res.json({ eleves: resultat });
});
