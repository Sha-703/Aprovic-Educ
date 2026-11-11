import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const TURSO_URL = (process.env.TURSO_DATABASE_URL || '').trim();
const TURSO_TOKEN = (process.env.TURSO_AUTH_TOKEN || '').trim();

/** true = base distante (libSQL en HTTPS) ; false = fichier local (dev et tests). */
export const modeDistant = Boolean(TURSO_URL && TURSO_TOKEN);

/**
 * Erreur reseau (socket morte, coupure transitoire) — reessai possible :
 * le plus souvent une connexion keep-alive fermee entre deux rafales.
 */
function erreurReseau(e) {
  const cause = e?.cause ?? e;
  const code = String(cause?.code ?? '');
  const message = String(cause?.message ?? e?.message ?? '');
  return (
    ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(
      code
    ) || /fetch failed|socket hang up|other side closed/i.test(message)
  );
}

/** Execute une action distante avec un seul reessai si le reseau coupe. */
async function reessai(action) {
  try {
    return await action();
  } catch (e) {
    if (!erreurReseau(e)) throw e;
    await new Promise((r) => setTimeout(r, 300));
    return action();
  }
}

/**
 * Transforme les lignes du driver distant en objets JS simples,
 * strictement identiques a ceux de node:sqlite en mode local.
 */
function lignesSimples(resultat) {
  return resultat.rows.map((ligne) => {
    const objet = {};
    for (const col of resultat.columns) objet[col] = ligne[col];
    return objet;
  });
}

/**
 * Adaptateur de base de donnees — la meme API dans les deux modes,
 * et TOUJOURS asynchrone (meme en local) : un `await` oublie cassera
 * les tests en local avant meme d'aller voir la base distante.
 */
let base;

if (modeDistant) {
  const { createClient } = await import('@libsql/client');
  const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  base = {
    async exec(sql) {
      await reessai(() => client.executeMultiple(sql));
    },
    /** Pragma : peut ne pas etre supporte a distance -> ignore. */
    async pragma(sql) {
      try {
        await client.execute(sql);
      } catch {
        /* rien */
      }
    },
    prepare(sql) {
      return {
        async run(...args) {
          const r = await reessai(() => client.execute({ sql, args }));
          return {
            changes: Number(r.rowsAffected || 0),
            lastInsertRowid: Number(r.lastInsertRowid || 0),
          };
        },
        async get(...args) {
          const r = await reessai(() => client.execute({ sql, args }));
          return lignesSimples(r)[0];
        },
        async all(...args) {
          const r = await reessai(() => client.execute({ sql, args }));
          return lignesSimples(r);
        },
      };
    },
  };
} else {
  const sqlite = new DatabaseSync(path.join(dataDir, 'aprovic.db'));

  base = {
    async exec(sql) {
      sqlite.exec(sql);
    },
    async pragma(sql) {
      sqlite.exec(sql);
    },
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return {
        async run(...args) {
          const r = stmt.run(...args);
          return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
        },
        async get(...args) {
          return stmt.get(...args);
        },
        async all(...args) {
          return stmt.all(...args);
        },
      };
    },
  };
}

export const db = base;

/* ==================== Schema ==================== */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS classes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nom        TEXT NOT NULL,
    niveau     TEXT NOT NULL DEFAULT '',
    code       TEXT NOT NULL UNIQUE,
    enseignant_id INTEGER NOT NULL,
    option_classe TEXT NOT NULL DEFAULT '',
    cree_le    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nom           TEXT NOT NULL,
    email         TEXT UNIQUE,
    mot_de_passe  TEXT,
    role          TEXT NOT NULL CHECK (role IN ('enseignant', 'eleve')),
    matricule     TEXT NOT NULL UNIQUE,
    classe_id     INTEGER REFERENCES classes(id),
    ecole         TEXT NOT NULL DEFAULT '',
    cree_le       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contenus (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    classe_id     INTEGER NOT NULL REFERENCES classes(id),
    enseignant_id INTEGER NOT NULL,
    titre         TEXT NOT NULL,
    type          TEXT NOT NULL CHECK (type IN ('texte', 'video', 'pdf', 'fichier')),
    corps         TEXT,
    url           TEXT,
    nom_fichier   TEXT,
    taille        INTEGER,
    date_fin      TEXT,
    cree_le       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS devoirs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    classe_id     INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    enseignant_id INTEGER NOT NULL,
    titre         TEXT NOT NULL,
    type          TEXT NOT NULL CHECK (type IN ('qcm', 'ouvert')),
    consigne      TEXT NOT NULL DEFAULT '',
    date_fin      TEXT NOT NULL,
    note_max      REAL NOT NULL DEFAULT 20,
    cree_le       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS questions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    devoir_id      INTEGER NOT NULL REFERENCES devoirs(id) ON DELETE CASCADE,
    enonce         TEXT NOT NULL,
    choix          TEXT NOT NULL,
    bonne_reponse  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rendus (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    devoir_id   INTEGER NOT NULL REFERENCES devoirs(id) ON DELETE CASCADE,
    eleve_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reponse     TEXT,
    note        REAL,
    commentaire TEXT,
    statut      TEXT NOT NULL DEFAULT 'rendu' CHECK (statut IN ('rendu', 'corrige')),
    soumis_le   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (devoir_id, eleve_id)
  );

  CREATE TABLE IF NOT EXISTS presences (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id),
    debut             TEXT NOT NULL,
    derniere_activite TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_presences_user ON presences(user_id);
`;

if (!modeDistant) {
  // Local uniquement : WAL pour la concurrence lecture/ecriture
  await db.pragma('PRAGMA journal_mode = WAL;');
}
await db.pragma('PRAGMA foreign_keys = ON;');
await db.exec(SCHEMA);

// Migrations : colonnes ajoutees apres la creation initiale
// (ALTER + "deja la" capture : portable local ET distant, sans PRAGMA)
async function ajouterColonne(table, colonne, definition) {
  try {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${colonne} ${definition}`);
  } catch (e) {
    const dejaLa = String(e?.message || '').toLowerCase().includes('duplicate column');
    if (!dejaLa) throw e;
  }
}
await ajouterColonne('users', 'ecole', "TEXT DEFAULT ''");
await ajouterColonne('classes', 'option_classe', "TEXT DEFAULT ''");
await ajouterColonne('contenus', 'date_fin', 'TEXT');

/** Vrai si le matricule existe deja en base. */
export async function matriculeExiste(matricule) {
  const ligne = await db.prepare('SELECT id FROM users WHERE matricule = ?').get(matricule);
  return ligne !== undefined;
}
