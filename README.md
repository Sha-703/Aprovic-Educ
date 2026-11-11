# Aprovic Educ

Plateforme web (PWA) d'enseignement du francais, basee sur la **classe inversee**.
Memes principes que Google Classroom, mais pensee pour le francais.

## Fonctionnalites

- Page de connexion **unique** avec choix du role (eleve / enseignant)
- Compte enseignant : inscription (**nom, e-mail, ecole**) → **matricule genere automatiquement** (unique, aleatoire `ENS-XXXXXX`)
- Connexion enseignant : matricule + mot de passe — connexion eleve : **matricule seul** (`CODECLASSE-XXXXXX`)
- **Navbar** de navigation (Accueil, Mes classes, Mes contenus, Devoirs, Statistiques) + menu compte (avatar)
- **Classes** : niveaux pre-enregistres du secondaire RDC (**7eme EB, 8eme EB, 1ere → 4eme**) et options pre-enregistrees (**Scientifique, Litteraire, Humanites Pedagogiques, Commerciale et Gestion, Electricite, Electronique…**) avec saisie libre « Autre » — et eleves avec matricules
- **Contenus** (classe inversee) : texte, video (URL ou televersement), PDF, fichier — avec **date de fin**
- **Devoirs QCM** : questions a choix multiples, **correction automatique**, note et detail envoyes a l'eleve
- **Devoirs ouverts** : reponse redigee, **correction manuelle** par l'enseignant (note + commentaire)
- **Echeance** : apres la date de fin, contenu/devoir **disparait pour l'eleve**, est **archive pour l'enseignant** qui peut le **republier** avec une nouvelle date ; rendu non soumis = statut **« manque »**
- **Statistiques** : connexions, sessions et temps passe par eleve (heartbeat toutes les 30 s)
- Page **Reglages** : profil (nom, e-mail, ecole) + mot de passe
- PWA : manifest + service worker (installable, mode hors-ligne)

## Lancer le projet

```bash
npm install
npm run dev        # API : http://localhost:3001  |  UI : http://localhost:5173
```

## Build / production

```bash
npm run build      # genere le dossier dist/
npm start          # sert l'API + la PWA sur http://localhost:3001
```

## Deploiement — Render (gratuit)

Le repo contient un blueprint `render.yaml` : API + front sur le **meme service**.

1. Pousse le projet sur GitHub (deja fait)
2. Sur [render.com](https://dashboard.render.com) → **New + Blueprint** → connecte le repo `Sha-703/Aprovic-Educ`
3. Render lit `render.yaml` tout seul (Node 24, build, `/api/sante` comme health check) → **Deploy**
4. L'app est servie sur `https://aprovic-educ.onrender.com` (HTTPS = PWA installable)

Notes importantes du plan gratuit :

- **Mise en veille après ~15 min d'inactivité** : le premier appel suivant met ~50 s
  (les tests d'API ne passent que si le service est "réveillé").
- Chaque push sur `main` redéploie automatiquement.

### Persistance des données (Turso + R2)

Le disque de Render est **éphémère** (vide à chaque redéploiement) : sans configuration,
les comptes et contenus disparaissent. L'application se connecte donc à une base
**distante** dès que deux variables d'environnement sont renseignées :

| Variables | Rôle | Service |
|---|---|---|
| `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | Base de donnees (comptes, classes, contenus, devoirs) | [Turso](https://turso.tech) — gratuit |
| `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Fichiers televerses (videos, PDF) | [Cloudflare R2](https://www.cloudflare.com/developer-platform/products/r2/) — gratuit (10 Go) |

**Installation une fois pour toutes :**

1. Créer une base sur turso.tech (login GitHub) → `turso db create aprovic` (ou via le
   dashboard) → copier l'**URL** (`libsql://…`) et générer un **auth token**
2. Créer un bucket sur dash.cloudflare.com → R2 → **Create bucket** → **Manage R2 API
   Tokens** → token **Object Read & Write** (celui du bucket) → récupérer Access Key ID,
   Secret Access Key et l'endpoint régional (`https://<ACCOUNT>.r2.cloudflarestorage.com`)
3. Sur Render → service → **Environment** → coller les valeurs dans les slots déjà
   prévus par `render.yaml` (Render redémarre tout seul)

**Comportement :**

- Variables **vides** → mode local : fichier `data/*.db` + `uploads/` (données jetables).
- `TURSO_*` renseignées → **toutes les données persistent** (redeploiements compris).
- `R2_*` renseignées → les fichiers téléversés partent sur R2 (sinon disque local).
- Le serveur affiche le mode au démarrage : `base distante (libSQL)` ou `base locale (fichier)`.
- En dev local (`npm run dev`), aucune variable requise : tout fonctionne en fichier.
- Le token Turso est un secret : jamais dans le code, uniquement dans Render/env.

## Structure

```
aprovic-educ/
├── server/            # API Express + SQLite (node:sqlite)
│   ├── index.js       # point d'entree serveur
│   ├── db.js          # base de données : mode local (node:sqlite) + mode distant (Turso/libSQL)
│   ├── stockage.js    # fichiers : disque local + Cloudflare R2 (envoi, suppression, URL signee)
│   ├── erreurs.js     # gestion des erreurs async des routes (Express 4)
│   ├── auth.js        # inscription / connexion / profil / mot de passe
│   ├── matricule.js   # generation des matricules uniques
│   ├── classes.js     # classes & eleves
│   ├── contenus.js    # contenus + date de fin + republiage + /uploads
│   ├── devoirs.js     # devoirs QCM/ouverts, rendus, correction, echeances
│   ├── presence.js    # heartbeat + statistiques
│   ├── security.js    # JWT + middleware d'authentification
│   └── test-*.mjs     # suites de tests (serveur requis sur le port 3001)
├── src/               # interface React (PWA)
│   ├── pages/         # Login, Inscription, Espace, Classes, Contenus, MesContenus, Devoirs, DevoirsEleve, Stats, Reglages
│   ├── api.js         # appels HTTP + gestion du token
│   └── styles.css
├── public/            # manifest PWA, icone, service worker
└── data/              # base SQLite (generee automatiquement, non versionnee)
```

## Roadmap

- [x] Phase 1 — structure, base de donnees, connexion + matricules
- [x] Phase 2 — classes & eleves (matricules `CODECLASSE-XXXXXX`), menu compte (icone en haut)
- [x] Phase 3 — contenus (texte, video, fichier, PDF) + stats de connexion (temps passe)
- [x] Phase 4 — devoirs QCM + correction automatique + date de fin / archives / republiage
- [x] Phase 5 — devoirs ouverts + correction enseignant + statut "manque"
- [x] Phase 6 — deploiement Render + persistance (base Turso, fichiers R2)

## Tests

```bash
node server/index.js        # (dans un terminal)
node server/test-api.mjs    # Phase 1
node server/test-phase2.mjs # Phase 2
node server/test-phase3.mjs # Phase 3
node server/test-phase4.mjs # Phases 4-5 (devoirs + echeances)
```

98 tests au total. Les mêmes suites passent en mode distant : lance le serveur avec
`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` dans l'environnement avant de lancer les tests.
