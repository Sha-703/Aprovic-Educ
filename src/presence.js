import { api, getToken } from './api.js';

const INTERVALLE = 30000; // 30 secondes
let timer = null;

function battre() {
  if (!getToken()) return;
  api('/presence', { method: 'POST' }).catch(() => {});
}

/**
 * Presence en temps reel : envoie un heartbeat toutes les 30 s
 * pour calculer le temps passe dans l'application.
 */
export function demarrerPresence() {
  if (timer) return;
  battre();
  timer = setInterval(battre, INTERVALLE);

  // A chaque retour sur l'onglet : heartbeat immediat
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) battre();
  });

  // A la fermeture : on tente un dernier envoi (keepalive)
  window.addEventListener('beforeunload', () => {
    if (!getToken()) return;
    fetch('/api/presence', {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
    }).catch(() => {});
  });
}
