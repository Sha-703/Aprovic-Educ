import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const secretFile = path.join(dataDir, 'secret.txt');

// Secret JWT : priorite a la variable d'environnement (stable sur Render),
// puis fichier local, sinon generation aleatoire
fs.mkdirSync(dataDir, { recursive: true });
let secret;
if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) {
  secret = process.env.JWT_SECRET.trim();
} else if (fs.existsSync(secretFile)) {
  secret = fs.readFileSync(secretFile, 'utf8').trim();
} else {
  secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, secret, { mode: 0o600 });
}

export function creerToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, matricule: user.matricule, nom: user.nom },
    secret,
    { expiresIn: '7d' }
  );
}

/** Middleware : verifie l'en-tete Authorization Bearer <token>. */
export function requireAuth(req, res, next) {
  const entete = req.headers.authorization || '';
  const token = entete.startsWith('Bearer ') ? entete.slice(7) : null;
  if (!token) return res.status(401).json({ erreur: 'Connexion requise.' });
  try {
    req.auth = jwt.verify(token, secret);
    next();
  } catch {
    res.status(401).json({ erreur: 'Session expiree, reconnectez-vous.' });
  }
}

/** Middleware : restreint l'acces a un role precise. */
export function requireRole(role) {
  return (req, res, next) => {
    if (!req.auth || req.auth.role !== role) {
      return res.status(403).json({ erreur: 'Acces reserve.' });
    }
    next();
  };
}
