# Aprovic Educ

Plateforme web (PWA) d'enseignement du francais, basee sur la **classe inversee**.
Memes principes que Google Classroom, mais pensee pour le francais.

## Fonctionnalites

- Page de connexion **unique** avec choix du role (eleve / enseignant)
- Compte enseignant : inscription (**nom, e-mail, ecole**) → **matricule genere automatiquement** (unique, aleatoire `ENS-XXXXXX`)
- Connexion enseignant : matricule + mot de passe — connexion eleve : **matricule seul** (`CODECLASSE-XXXXXX`)
- **Navbar** de navigation (Accueil, Mes classes, Mes contenus, Devoirs, Statistiques) + menu compte (avatar)
- **Classes** : niveau (1er, 2eme…), option (Scientifique, Litteraire…) et eleves avec matricules
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

- **Les données (`data/*.db`) et les fichiers `uploads/` sont éphémères** : à chaque
  redéploiement, la base repart vide (le secret JWT, lui, est conservé via `JWT_SECRET`).
  Pour un usage réel avec persistance → plan Starter + disque, ou un petit VPS.
- **Mise en veille après ~15 min d'inactivité** : le premier appel suivant met ~50 s
  (les tests d'API ne passent que si le service est "réveillé").
- Chaque push sur `main` redéploie automatiquement.

## Structure

```
aprovic-educ/
├── server/            # API Express + SQLite (node:sqlite)
│   ├── index.js       # point d'entree serveur
│   ├── db.js          # base de données (users, classes, contenus, devoirs, questions, rendus, presences)
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
- [ ] Phase 6 — finitions PWA et deploiement

## Tests

```bash
node server/index.js        # (dans un terminal)
node server/test-api.mjs    # Phase 1
node server/test-phase2.mjs # Phase 2
node server/test-phase3.mjs # Phase 3
node server/test-phase4.mjs # Phases 4-5 (devoirs + echeances)
```
