import { Router } from 'express';
import { db } from './db.js';
import { genererMatricule, genererCodeClasse, codeClasseExiste } from './matricule.js';
import { requireAuth, requireRole } from './security.js';

/* =========================================================
   Routes enseignant : gestion des classes et des eleves
   ========================================================= */
export const routerEnseignant = Router();
// Garde appliquee route par route (evite d'intercepter les routes d'un autre router monte sur /api)
const autorise = [requireAuth, requireRole('enseignant')];

/** Cherche une classe appartenant a l'enseignant connecte (sinon null + reponse envoyee). */
export function classeDemandee(req, res) {
  const classe = db
    .prepare('SELECT * FROM classes WHERE id = ? AND enseignant_id = ?')
    .get(Number(req.params.id), req.auth.id);
  if (!classe) {
    res.status(404).json({ erreur: 'Classe introuvable.' });
    return null;
  }
  return classe;
}

// GET /api/classes — mes classes (avec le nombre d'eleves)
routerEnseignant.get('/classes', ...autorise, (req, res) => {
  const classes = db
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM users u WHERE u.classe_id = c.id AND u.role = 'eleve') AS nb_eleves
       FROM classes c
       WHERE c.enseignant_id = ?
       ORDER BY c.cree_le DESC`
    )
    .all(req.auth.id);
  res.json({ classes });
});

// POST /api/classes — creer une classe (code genere si non fourni)
routerEnseignant.post('/classes', ...autorise, (req, res) => {
  const { nom, niveau = '', code, option_classe, option } = req.body || {};
  const optionFinale = String(option_classe ?? option ?? '').trim();

  if (!nom || String(nom).trim().length < 2) {
    return res.status(400).json({ erreur: 'Le nom de la classe est requis (2 caracteres min).' });
  }
  if (optionFinale.length > 60) {
    return res.status(400).json({ erreur: "L'option est trop longue (60 caracteres max)." });
  }

  let codeFinal;
  if (code && String(code).trim()) {
    codeFinal = String(code).trim().toUpperCase();
    if (!/^[A-Z0-9]{2,6}$/.test(codeFinal)) {
      return res.status(400).json({ erreur: 'Le code doit contenir 2 a 6 lettres ou chiffres.' });
    }
    if (codeClasseExiste(codeFinal)) {
      return res.status(409).json({ erreur: 'Ce code de classe est deja utilise.' });
    }
  } else {
    codeFinal = genererCodeClasse();
  }

  const resultat = db
    .prepare(
      'INSERT INTO classes (nom, niveau, code, enseignant_id, option_classe) VALUES (?, ?, ?, ?, ?)'
    )
    .run(
      String(nom).trim(),
      String(niveau).trim().slice(0, 60),
      codeFinal,
      req.auth.id,
      optionFinale.slice(0, 60)
    );

  const classe = db.prepare('SELECT * FROM classes WHERE id = ?').get(resultat.lastInsertRowid);
  res.status(201).json({ classe });
});

// GET /api/classes/:id/eleves — liste des eleves de la classe
routerEnseignant.get('/classes/:id/eleves', ...autorise, (req, res) => {
  const classe = classeDemandee(req, res);
  if (!classe) return;

  const eleves = db
    .prepare(
      `SELECT id, nom, matricule, cree_le
       FROM users WHERE classe_id = ? AND role = 'eleve'
       ORDER BY nom`
    )
    .all(classe.id);
  res.json({ classe, eleves });
});

// POST /api/classes/:id/eleves — ajouter un ou plusieurs eleves
// Chaque eleve recoit un matricule unique du format CODECLASSE-XXXXXX
routerEnseignant.post('/classes/:id/eleves', ...autorise, (req, res) => {
  const classe = classeDemandee(req, res);
  if (!classe) return;

  const { nom, noms } = req.body || {};
  const liste = (Array.isArray(noms) ? noms : [nom])
    .map((n) => String(n || '').trim())
    .filter((n) => n.length >= 2);

  if (liste.length === 0) {
    return res.status(400).json({ erreur: 'Le nom de l\'eleve est requis (2 caracteres min).' });
  }

  const crees = liste.map((nomEleve) => {
    const matricule = genererMatricule(classe.code);
    const resultat = db
      .prepare(
        'INSERT INTO users (nom, mot_de_passe, role, matricule, classe_id) VALUES (?, NULL, ?, ?, ?)'
      )
      .run(nomEleve.slice(0, 80), 'eleve', matricule, classe.id);
    return { id: resultat.lastInsertRowid, nom: nomEleve.slice(0, 80), matricule };
  });

  res.status(201).json({ eleves: crees });
});

// DELETE /api/classes/:id/eleves/:eleveId — supprimer un eleve
routerEnseignant.delete('/classes/:id/eleves/:eleveId', ...autorise, (req, res) => {
  const classe = classeDemandee(req, res);
  if (!classe) return;

  const eleve = db
    .prepare("SELECT * FROM users WHERE id = ? AND role = 'eleve' AND classe_id = ?")
    .get(Number(req.params.eleveId), classe.id);
  if (!eleve) return res.status(404).json({ erreur: 'Eleve introuvable.' });

  db.prepare('DELETE FROM users WHERE id = ?').run(eleve.id);
  res.json({ message: `Eleve ${eleve.nom} supprime.` });
});

// DELETE /api/classes/:id — supprimer une classe (et ses eleves)
routerEnseignant.delete('/classes/:id', ...autorise, (req, res) => {
  const classe = classeDemandee(req, res);
  if (!classe) return;

  db.prepare("DELETE FROM users WHERE classe_id = ? AND role = 'eleve'").run(classe.id);
  db.prepare('DELETE FROM classes WHERE id = ?').run(classe.id);
  res.json({ message: `Classe ${classe.nom} supprimee.` });
});

/* =========================================================
   Route eleve : sa classe, son enseignant, ses camarades
   ========================================================= */
export const routerEleve = Router();
routerEleve.use(requireAuth, requireRole('eleve'));

routerEleve.get('/ma-classe', (req, res) => {
  const eleve = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.id);

  if (!eleve.classe_id) {
    return res.json({ classe: null, enseignant: null, camarades: [] });
  }

  const classe = db.prepare('SELECT * FROM classes WHERE id = ?').get(eleve.classe_id);
  if (!classe) return res.json({ classe: null, enseignant: null, camarades: [] });

  const enseignant = db.prepare('SELECT nom FROM users WHERE id = ?').get(classe.enseignant_id);
  const camarades = db
    .prepare(
      "SELECT nom FROM users WHERE classe_id = ? AND role = 'eleve' AND id != ? ORDER BY nom"
    )
    .all(classe.id, eleve.id);

  res.json({
    classe: {
      id: classe.id,
      nom: classe.nom,
      niveau: classe.niveau,
      code: classe.code,
      option_classe: classe.option_classe || '',
    },
    matricule: eleve.matricule,
    enseignant: enseignant ? enseignant.nom : null,
    camarades: camarades.map((c) => c.nom),
  });
});
