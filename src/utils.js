/** Copie du texte dans le presse-papier. Retourne true si reussi. */
export async function copier(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    return false;
  }
}

/** Formate une duree en secondes : "2 h 14 min", "45 min", "30 s". */
export function formaterDuree(secondes) {
  const s = Math.max(0, Math.round(secondes || 0));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  if (m) return `${m} min`;
  return `${s} s`;
}

/** Formate une date ISO en "07/11/2026 14:32". */
export function formaterDate(iso) {
  if (!iso) return 'Jamais';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Jamais';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Formate une taille de fichier en octets. */
export function formaterTaille(o) {
  if (!o && o !== 0) return '';
  if (o < 1024) return `${o} o`;
  if (o < 1024 * 1024) return `${(o / 1024).toFixed(1)} Ko`;
  return `${(o / (1024 * 1024)).toFixed(1)} Mo`;
}
