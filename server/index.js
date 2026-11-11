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
import rechercheRoutes from './recherche.js';
import { db, modeDistant } from './db.js';
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
app.use('/api/recherche', rechercheRoutes);
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

/** Formate un temps de marche lisible (ex. « 2h 14min »). */
function dureeLisible(secondes) {
  const h = Math.floor(secondes / 3600);
  const m = Math.floor((secondes % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${secondes % 60}s`;
  return `${secondes}s`;
}

/** Page HTML de l'etat du service (meme theme bleu que l'application). */
function pageEtat(r) {
  const ligne = (libelle, valeur, ok = true) => `
      <div class="ligne">
        <span class="pastille ${ok ? 'ok' : 'ko'}"></span>
        <strong>${libelle}</strong>
        <span class="val">${valeur}</span>
      </div>`;
  const ko = r.etat !== 'ok';
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aprovic Educ — Etat du service</title>
<style>
  :root { --bleu: #1d4ed8; --bleu-fonce: #1e3a8a; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px; background: #f4f6fb; color: #1f2937;
    font-family: 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif;
  }
  .carte {
    width: 100%; max-width: 560px; background: #fff; border: 1px solid #eef1f6;
    border-radius: 16px; box-shadow: 0 8px 30px rgba(30, 58, 138, 0.08); padding: 28px 30px;
  }
  .carte h1 { margin: 0 0 6px; font-size: 1.3rem; color: var(--bleu-fonce); }
  .resume { margin: 0 0 20px; font-weight: 700; color: #16a34a; }
  .resume.ko { color: #dc2626; }
  .ligne {
    display: flex; align-items: center; gap: 12px; padding: 13px 15px;
    border: 1px solid #eef1f6; border-radius: 12px; margin-bottom: 10px; background: #fbfcfe;
  }
  .pastille { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
  .pastille.ok { background: #16a34a; box-shadow: 0 0 0 4px #dcfce7; }
  .pastille.ko { background: #dc2626; box-shadow: 0 0 0 4px #fee2e2; }
  .ligne strong { font-size: 0.95rem; }
  .val { margin-left: auto; font-size: 0.85rem; color: #6b7280; text-align: right; }
  .pied {
    margin-top: 16px; display: flex; justify-content: space-between; gap: 10px;
    flex-wrap: wrap; font-size: 0.78rem; color: #9ca3af;
  }
  .pied a { color: var(--bleu); text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
  <main class="carte">
    <h1>🩺 Aprovic Educ</h1>
    <p class="resume${ko ? ' ko' : ''}">${ko ? '✘ Probleme detecte sur le service' : '✔ Tout est operationnel'}</p>
    ${ligne('API', 'Operationnelle')}
    ${ligne('Base de donnees', r.base_accessible ? r.base : `${r.base} — inaccessible`, r.base_accessible)}
    ${ligne('Stockage des fichiers', r.stockage)}
    <div class="pied">
      <span>Temps de marche : ${dureeLisible(r.uptime_secondes)}</span>
      <span>Reponse : ${r.reponse_ms} ms</span>
      <span>${r.horodatage}</span>
    </div>
    <div class="pied"><a href="/">← Retour a l'application</a></div>
  </main>
</body>
</html>`;
}

/**
 * GET /health — page d'etat du service.
 * JSON pour Render et les moniteurs ; page HTML pour le navigateur.
 * Teste une vraie requete sur la base : 503 si elle n'est pas joignable.
 */
app.get('/health', async (req, res) => {
  const debut = Date.now();
  let baseOk = true;
  try {
    await db.prepare('SELECT 1 AS ok').get();
  } catch {
    baseOk = false;
  }
  const rapport = {
    etat: baseOk ? 'ok' : 'erreur',
    application: 'Aprovic Educ',
    base: modeDistant ? 'distante (libSQL)' : 'locale (fichier)',
    base_accessible: baseOk,
    stockage: modeR2 ? 'Cloudflare R2' : 'disque local',
    uptime_secondes: Math.round(process.uptime()),
    reponse_ms: Date.now() - debut,
    horodatage: new Date().toISOString(),
  };
  res.status(baseOk ? 200 : 503);
  if (String(req.headers.accept || '').includes('text/html')) {
    res.type('html').send(pageEtat(rapport));
  } else {
    res.json(rapport);
  }
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
