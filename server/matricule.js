import crypto from 'node:crypto';
import { db, matriculeExiste } from './db.js';

// Alphabet sans caracteres ambiguels (pas de I, O, 0, 1)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function suiteAleatoire(longueur) {
  let sortie = '';
  for (let i = 0; i < longueur; i++) {
    sortie += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return sortie;
}

/**
 * Genere un matricule unique, aleatoire et non devinable.
 * - Enseignant : ENS-XXXXXX
 * - Eleve      : <CODE-CLASSE>-XXXXXX (le matricule reference ainsi l'eleve ET sa classe)
 *
 * @param {string} prefixe  prefixe du matricule (ex. "ENS" ou le code de la classe)
 * @returns {string}
 */
export function genererMatricule(prefixe) {
  const nettoye = String(prefixe || 'AP')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);

  let matricule;
  do {
    matricule = `${nettoye}-${suiteAleatoire(6)}`;
  } while (matriculeExiste(matricule));

  return matricule;
}

/** Vrai si le code de classe est deja utilise. */
export function codeClasseExiste(code) {
  return db.prepare('SELECT id FROM classes WHERE code = ?').get(code) !== undefined;
}

/** Genere un code de classe court et unique (ex. "K7MP"). */
export function genererCodeClasse() {
  let code;
  do {
    code = suiteAleatoire(4);
  } while (codeClasseExiste(code));
  return code;
}
