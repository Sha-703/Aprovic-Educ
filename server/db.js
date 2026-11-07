import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'aprovic.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS classes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nom        TEXT NOT NULL,
    niveau     TEXT NOT NULL DEFAULT '',
    code       TEXT NOT NULL UNIQUE,
    enseignant_id INTEGER NOT NULL,
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
    cree_le       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contenus (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    classe_id     INTEGER NOT NULL REFERENCES classes(id),
    enseignant_id INTEGER NOT NULL,
    titre         TEXT NOT NULL,
    type          TEXT NOT NULL CHECK (type IN ('texte', 'video', 'fichier', 'pdf')),
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
`);

// Migrations : colonnes ajoutees apres la creation initiale
function ajouterColonne(table, colonne, definition) {
  const colonnes = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!colonnes.some((c) => c.name === colonne)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${colonne} ${definition}`);
  }
}
ajouterColonne('users', 'ecole', "TEXT DEFAULT ''");
ajouterColonne('classes', 'option_classe', "TEXT DEFAULT ''");
ajouterColonne('contenus', 'date_fin', 'TEXT');

/** Vrai si le matricule existe deja en base. */
export function matriculeExiste(matricule) {
  const ligne = db.prepare('SELECT id FROM users WHERE matricule = ?').get(matricule);
  return ligne !== undefined;
}
