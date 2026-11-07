import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, matriculeExiste } from './db.js';
import { genererMatricule } from './matricule.js';
import { creerToken, requireAuth } from './security.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publier(user) {
  return {
    id: user.id,
    nom: user.nom,
    email: user.email ?? null,
    role: user.role,
    matricule: user.matricule,
    classe_id: user.classe_id ?? null,
    ecole: user.ecole ?? '',
  };
}

/**
 * POST /api/auth/inscription-enseignant
 * Cree un compte enseignant et lui attribue un matricule de connexion.
 */
router.post('/inscription-enseignant', (req, res) => {
  const { nom, email, motDePasse, ecole } = req.body || {};

  if (!nom || String(nom).trim().length < 2) {
    return res.status(400).json({ erreur: 'Veuillez entrer votre nom complet.' });
  }
  if (!email || !EMAIL_RE.test(String(email))) {
    return res.status(400).json({ erreur: 'Adresse e-mail invalide.' });
  }
  if (!motDePasse || String(motDePasse).length < 6) {
    return res.status(400).json({ erreur: 'Le mot de passe doit contenir au moins 6 caracteres.' });
  }
  if (!ecole || String(ecole).trim().length < 2) {
    return res.status(400).json({ erreur: "Veuillez indiquer votre ecole." });
  }

  const emailExiste = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (emailExiste) {
    return res.status(409).json({ erreur: 'Un compte existe deja avec cette adresse e-mail.' });
  }

  const matricule = genererMatricule('ENS');
  const hash = bcrypt.hashSync(String(motDePasse), 10);

  const resultat = db
    .prepare(
      'INSERT INTO users (nom, email, mot_de_passe, role, matricule, ecole) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      String(nom).trim(),
      String(email).toLowerCase(),
      hash,
      'enseignant',
      matricule,
      String(ecole).trim().slice(0, 120)
    );

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(resultat.lastInsertRowid);
  res.status(201).json({
    message: 'Compte cree. Notez bien votre matricule : il sert a vous connecter.',
    matricule,
    utilisateur: publier(user),
  });
});

/**
 * POST /api/auth/connexion
 * Connexion unique pour tous, selon le role choisi :
 * - enseignant : matricule + mot de passe
 * - eleve      : matricule seul (il reference l'eleve et sa classe)
 */
router.post('/connexion', (req, res) => {
  const { role, matricule, motDePasse } = req.body || {};

  if (role !== 'enseignant' && role !== 'eleve') {
    return res.status(400).json({ erreur: 'Veuillez choisir un role.' });
  }
  const code = String(matricule || '').trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ erreur: 'Veuillez entrer votre matricule.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE matricule = ? AND role = ?').get(code, role);
  if (!user) {
    return res.status(401).json({ erreur: 'Matricule introuvable pour ce role.' });
  }

  if (role === 'enseignant') {
    if (!motDePasse) {
      return res.status(400).json({ erreur: 'Veuillez entrer votre mot de passe.' });
    }
    if (!bcrypt.compareSync(String(motDePasse), user.mot_de_passe || '')) {
      return res.status(401).json({ erreur: 'Mot de passe incorrect.' });
    }
  }

  res.json({ token: creerToken(user), utilisateur: publier(user) });
});

/** GET /api/auth/me — profil de l'utilisateur connecte. */
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.id);
  if (!user) return res.status(401).json({ erreur: 'Compte introuvable.' });
  res.json({ utilisateur: publier(user) });
});

/** PUT /api/auth/profil — modifier son nom, son e-mail et son ecole. */
router.put('/profil', requireAuth, (req, res) => {
  const { nom, email, ecole } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.id);
  if (!user) return res.status(401).json({ erreur: 'Compte introuvable.' });

  if (!nom || String(nom).trim().length < 2) {
    return res.status(400).json({ erreur: 'Le nom doit contenir au moins 2 caracteres.' });
  }

  // Ecole : modifiable pour l'enseignant, ignore pour l'eleve
  let ecoleFinale = user.ecole || '';
  if (user.role === 'enseignant' && ecole !== undefined) {
    if (!String(ecole).trim()) {
      return res.status(400).json({ erreur: "L'ecole est requise." });
    }
    ecoleFinale = String(ecole).trim().slice(0, 120);
  }

  // Les eleves n'ont pas d'e-mail (connexion par matricule) : on ne touche pas si absent
  let emailFinal = user.email;
  if (email !== undefined) {
    if (user.role === 'eleve' && !String(email).trim()) {
      emailFinal = null;
    } else {
      if (!EMAIL_RE.test(String(email))) {
        return res.status(400).json({ erreur: 'Adresse e-mail invalide.' });
      }
      emailFinal = String(email).toLowerCase();
      const doublon = db
        .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
        .get(emailFinal, user.id);
      if (doublon) {
        return res.status(409).json({ erreur: 'Un compte utilise deja cette adresse e-mail.' });
      }
    }
  }

  db.prepare('UPDATE users SET nom = ?, email = ?, ecole = ? WHERE id = ?').run(
    String(nom).trim().slice(0, 80),
    emailFinal,
    ecoleFinale,
    user.id
  );
  const maj = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  res.json({ message: 'Profil mis a jour.', utilisateur: publier(maj) });
});

/** PUT /api/auth/mot-de-passe — changer son mot de passe (enseignant). */
router.put('/mot-de-passe', requireAuth, (req, res) => {
  if (req.auth.role !== 'enseignant') {
    return res.status(403).json({ erreur: 'Acces reserve.' });
  }
  const { actuel, nouveau } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.id);
  if (!user) return res.status(401).json({ erreur: 'Compte introuvable.' });

  if (!actuel || !bcrypt.compareSync(String(actuel), user.mot_de_passe || '')) {
    return res.status(401).json({ erreur: 'Mot de passe actuel incorrect.' });
  }
  if (!nouveau || String(nouveau).length < 6) {
    return res.status(400).json({ erreur: 'Le nouveau mot de passe doit contenir au moins 6 caracteres.' });
  }

  db.prepare('UPDATE users SET mot_de_passe = ? WHERE id = ?').run(
    bcrypt.hashSync(String(nouveau), 10),
    user.id
  );
  res.json({ message: 'Mot de passe modifie.' });
});

export default router;
