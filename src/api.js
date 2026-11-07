const CLE = 'aprovic_token';

export const getToken = () => localStorage.getItem(CLE);
export const setToken = (token) =>
  token ? localStorage.setItem(CLE, token) : localStorage.removeItem(CLE);

async function traiter(reponse) {
  const donnees = await reponse.json().catch(() => ({}));
  if (!reponse.ok) {
    const erreur = new Error(donnees.erreur || 'Erreur du serveur.');
    erreur.statut = reponse.status;
    throw erreur;
  }
  return donnees;
}

/** Appel API JSON avec gestion du token et des erreurs. */
export async function api(chemin, { method = 'GET', corps } = {}) {
  const entetes = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) entetes.Authorization = `Bearer ${token}`;

  const reponse = await fetch(`/api${chemin}`, {
    method,
    headers: entetes,
    body: corps !== undefined ? JSON.stringify(corps) : undefined,
  });
  return traiter(reponse);
}

/** Envoi multipart (fichiers) — le navigateur pose lui-meme l'en-tête Content-Type. */
export async function apiForm(chemin, formData) {
  const entetes = {};
  const token = getToken();
  if (token) entetes.Authorization = `Bearer ${token}`;

  const reponse = await fetch(`/api${chemin}`, {
    method: 'POST',
    headers: entetes,
    body: formData,
  });
  return traiter(reponse);
}
