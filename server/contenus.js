import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { requireAuth, requireRole } from './security.js';
import { classeDemandee } from './classes.js';
import { routerProtege } from './erreurs.js';
import { dossierUploads, envoyerVersStockage, supprimerFichier } from './stockage.js';

export { dossierUploads };

// Fichiers interdits (execution)
const EXTENSIONS_INTERDITES = [
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.vbs', '.js', '.mjs', '.sh', '.php', '.ps1',
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dossierUploads),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`);
  },
});

// 300 Mo max : les videos peuvent etre lourdes
export const upload = multer({ storage, limits: { fileSize: 300 * 1024 * 1024 } });

const TYPES = ['texte', 'video', 'pdf', 'fichier'];
const autorise = [requireAuth, requireRole('enseignant')];

function dateValide(v) {
  return v && !Number.isNaN(new Date(v).getTime());
}

function avecEtat(c) {
  return {
    ...c,
    expire: !!c.date_fin && new Date(c.date_fin).getTime() <= Date.now(),
  };
}

/** Supprime le fichier televerse si la requete echoue. */
function nettoyer(req) {
  if (req.file) {
    fs.rm(path.join(dossierUploads, req.file.filename), { force: true }, () => {});
  }
}

/* ==================== Enseignant ==================== */
export const routerContenusEnseignant = routerProtege();

// POST /api/classes/:id/contenus — creer un contenu (JSON ou multipart avec fichier)
routerContenusEnseignant.post(
  '/classes/:id/contenus',
  ...autorise,
  upload.single('fichier'),
  async (req, res) => {
    const classe = await classeDemandee(req, res);
    if (!classe) return nettoyer(req);

    const { titre, type, corps = '', url = '', date_fin } = req.body || {};

    if (!titre || String(titre).trim().length < 2) {
      nettoyer(req);
      return res.status(400).json({ erreur: 'Le titre est requis (2 caracteres min).' });
    }
    if (!dateValide(date_fin)) {
      nettoyer(req);
      return res.status(400).json({ erreur: 'La date de fin est requise.' });
    }
    if (new Date(date_fin).getTime() <= Date.now()) {
      nettoyer(req);
      return res.status(400).json({ erreur: 'La date de fin doit etre dans le futur.' });
    }
    if (!TYPES.includes(type)) {
      nettoyer(req);
      return res.status(400).json({ erreur: 'Type de contenu invalide.' });
    }
    if (req.file && EXTENSIONS_INTERDITES.includes(path.extname(req.file.originalname).toLowerCase())) {
      nettoyer(req);
      return res.status(400).json({ erreur: 'Ce type de fichier n\'est pas autorise.' });
    }
    if (type === 'texte' && !String(corps).trim()) {
      nettoyer(req);
      return res.status(400).json({ erreur: 'Le texte du contenu est requis.' });
    }
    if (type === 'video' && !req.file && !String(url).trim()) {
      nettoyer(req);
      return res.status(400).json({ erreur: 'Entrez une URL video ou televersez un fichier video.' });
    }
    if ((type === 'pdf' || type === 'fichier') && !req.file) {
      nettoyer(req);
      return res.status(400).json({ erreur: 'Le fichier est requis.' });
    }
    if (type === 'pdf' && req.file) {
      const estPdf =
        req.file.mimetype === 'application/pdf' ||
        path.extname(req.file.originalname).toLowerCase() === '.pdf';
      if (!estPdf) {
        nettoyer(req);
        return res.status(400).json({ erreur: 'Le fichier doit etre un PDF.' });
      }
    }

    let urlFinale = null;
    let nomFichier = null;
    let taille = null;

    if (req.file) {
      // Envoi vers le stockage (R2 en prod ; disque local en dev) avant insertion
      await envoyerVersStockage(req.file.path, req.file.filename, req.file.mimetype);
      urlFinale = `/uploads/${req.file.filename}`;
      nomFichier = String(req.file.originalname).slice(0, 200);
      taille = req.file.size;
    } else if (String(url).trim()) {
      const u = String(url).trim();
      if (!/^https?:\/\//i.test(u)) {
        nettoyer(req);
        return res.status(400).json({ erreur: 'L\'URL doit commencer par http:// ou https://' });
      }
      urlFinale = u.slice(0, 500);
    }

    const resultat = await db
      .prepare(
        `INSERT INTO contenus (classe_id, enseignant_id, titre, type, corps, url, nom_fichier, taille, date_fin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        classe.id,
        req.auth.id,
        String(titre).trim().slice(0, 200),
        type,
        type === 'texte' ? String(corps).slice(0, 100000) : null,
        urlFinale,
        nomFichier,
        taille,
        new Date(date_fin).toISOString()
      );

    const contenu = await db.prepare('SELECT * FROM contenus WHERE id = ?').get(resultat.lastInsertRowid);
    res.status(201).json({ contenu: avecEtat(contenu) });
  }
);

// PUT /api/classes/:id/contenus/:contenuId/republier — nouvelle date de fin (sort l'archive)
routerContenusEnseignant.put(
  '/classes/:id/contenus/:contenuId/republier',
  ...autorise,
  async (req, res) => {
    const classe = await classeDemandee(req, res);
    if (!classe) return;

    const contenu = await db
      .prepare('SELECT * FROM contenus WHERE id = ? AND classe_id = ?')
      .get(Number(req.params.contenuId), classe.id);
    if (!contenu) return res.status(404).json({ erreur: 'Contenu introuvable.' });

    const { date_fin } = req.body || {};
    if (!dateValide(date_fin)) {
      return res.status(400).json({ erreur: 'Date de fin invalide.' });
    }
    if (new Date(date_fin).getTime() <= Date.now()) {
      return res.status(400).json({ erreur: 'La nouvelle date de fin doit etre dans le futur.' });
    }

    await db.prepare('UPDATE contenus SET date_fin = ? WHERE id = ?').run(
      new Date(date_fin).toISOString(),
      contenu.id
    );
    const maj = await db.prepare('SELECT * FROM contenus WHERE id = ?').get(contenu.id);
    res.json({ message: 'Contenu republie.', contenu: avecEtat(maj) });
  }
);

// GET /api/classes/:id/contenus — mes contenus de la classe (actifs + archives)
routerContenusEnseignant.get('/classes/:id/contenus', ...autorise, async (req, res) => {
  const classe = await classeDemandee(req, res);
  if (!classe) return;

  const contenus = (await db
    .prepare('SELECT * FROM contenus WHERE classe_id = ? ORDER BY cree_le DESC')
    .all(classe.id))
    .map(avecEtat);
  res.json({ classe, contenus });
});

// DELETE /api/classes/:id/contenus/:contenuId
routerContenusEnseignant.delete(
  '/classes/:id/contenus/:contenuId',
  ...autorise,
  async (req, res) => {
    const classe = await classeDemandee(req, res);
    if (!classe) return;

    const contenu = await db
      .prepare('SELECT * FROM contenus WHERE id = ? AND classe_id = ?')
      .get(Number(req.params.contenuId), classe.id);
    if (!contenu) return res.status(404).json({ erreur: 'Contenu introuvable.' });

    if (contenu.url && contenu.url.startsWith('/uploads/')) {
      // On attend la suppression avant de repondre (pas de fichier fantome)
      await supprimerFichier(path.basename(contenu.url));
    }
    await db.prepare('DELETE FROM contenus WHERE id = ?').run(contenu.id);
    res.json({ message: `Contenu "${contenu.titre}" supprime.` });
  }
);

/* ==================== Eleve ==================== */
export const routerContenusEleve = routerProtege();
routerContenusEleve.use(requireAuth, requireRole('eleve'));

// GET /api/eleve/mes-contenus — contenus en cours de ma classe (expire = efface)
routerContenusEleve.get('/mes-contenus', async (req, res) => {
  const eleve = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.id);
  if (!eleve) return res.status(401).json({ erreur: 'Compte introuvable.' });

  if (!eleve.classe_id) {
    return res.json({ classe: null, contenus: [] });
  }

  const classe = await db.prepare('SELECT * FROM classes WHERE id = ?').get(eleve.classe_id);
  if (!classe) return res.json({ classe: null, contenus: [] });

  const maintenant = new Date().toISOString();
  const contenus = (await db
    .prepare(
      `SELECT * FROM contenus
       WHERE classe_id = ? AND (date_fin IS NULL OR date_fin > ?)
       ORDER BY cree_le DESC`
    )
    .all(classe.id, maintenant))
    .map(avecEtat);

  res.json({
    classe: { id: classe.id, nom: classe.nom, niveau: classe.niveau, code: classe.code },
    contenus,
  });
});
