import { formaterTaille } from '../utils.js';

/** Extrait l'ID d'une video YouTube pour l'integrer en iframe. */
function lienYoutube(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtube\.com\/.*[?&]v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

/** Affiche un contenu selon son type (texte, video, pdf, fichier). */
export default function Visualiseur({ contenu }) {
  if (contenu.type === 'texte') {
    return <div className="texte-contenu">{contenu.corps}</div>;
  }

  if (contenu.type === 'video') {
    const yt = lienYoutube(contenu.url);
    if (yt) {
      return (
        <div className="cadre-video">
          <iframe src={yt} title={contenu.titre} allowFullScreen />
        </div>
      );
    }
    if (contenu.url && contenu.url.startsWith('/uploads/')) {
      return <video className="video-contenu" src={contenu.url} controls />;
    }
    return (
      <a className="btn-secondaire" href={contenu.url} target="_blank" rel="noreferrer">
        Ouvrir la video dans un nouvel onglet
      </a>
    );
  }

  if (contenu.type === 'pdf') {
    return (
      <div className="bloc-pdf">
        <div className="cadre-pdf">
          <iframe src={contenu.url} title={contenu.titre} />
        </div>
        <a className="btn-secondaire" href={contenu.url} target="_blank" rel="noreferrer">
          Ouvrir / telecharger le PDF
        </a>
      </div>
    );
  }

  // Fichier
  return (
    <div className="bloc-fichier">
      <p className="info-fichier">
        {contenu.nom_fichier} {contenu.taille ? `· ${formaterTaille(contenu.taille)}` : ''}
      </p>
      <a className="btn-principal" href={contenu.url} download>
        Telecharger le fichier
      </a>
    </div>
  );
}
