import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from './auth.js';
import { routerEnseignant, routerEleve } from './classes.js';
import { routerContenusEnseignant, routerContenusEleve, dossierUploads } from './contenus.js';
import { routerDevoirsEnseignant, routerDevoirsEleve } from './devoirs.js';
import { routerPresence } from './presence.js';
import { modeDistant } from './db.js';
import { erreurHttp } from './erreurs.js';
import { modeR2, urlPresignee } from './stockage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', authRoutes);
// Ordre important : les routes eleve doivent etre montees avant les gardes enseignant
app.use('/api/eleve', routerEleve);
app.use('/api/eleve', routerContenusEleve);
app.use('/api/eleve', routerDevoirsEleve);
app.use('/api', routerPresence);
app.use('/api', routerContenusEnseignant);
app.use('/api', routerDevoirsEnseignant);
app.use('/api', routerEnseignant);

// Fichiers televerses (videos, PDF, documents) — noms aleatoires non devinables
if (modeR2) {
  // Prod : on redirige vers l'URL signee R2 (telechargement direct, debits max)
  app.get('/uploads/:fichier', async (req, res, next) => {
    try {
      res.redirect(await urlPresignee(req.params.fichier));
    } catch (e) {
      next(e);
    }
  });
} else {
  // Dev : fichier servi depuis le disque local
  app.use('/uploads', express.static(dossierUploads, { fallthrough: false }));
  // Fichier absent : 404 propre sans stacktrace dans les logs
  app.use('/uploads', (err, _req, res, _next) => {
    if (err && err.status === 404) return res.status(404).end();
    res.status(err?.status || 500).end();
  });
}

app.get('/api/sante', (_req, res) => {
  res.json({ ok: true, application: 'Aprovic Educ' });
});

// En production : sert le build de la PWA (dossier dist/)
const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// Erreurs non interceptees (rejets async des routes) : reponse JSON propre
app.use(erreurHttp);

app.listen(PORT, () => {
  console.log(
    `[Aprovic Educ] API prete sur http://localhost:${PORT} — base ${modeDistant ? 'distante (libSQL)' : 'locale (fichier)'}`
  );
});
