import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Dossier local des fichiers televerses (dev + tampon avant envoi R2). */
export const dossierUploads = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(dossierUploads, { recursive: true });

const CFG = {
  bucket: (process.env.R2_BUCKET || '').trim(),
  endpoint: (process.env.R2_ENDPOINT || '').trim(), // ex. https://XXXX.r2.cloudflarestorage.com
  accessKeyId: (process.env.R2_ACCESS_KEY_ID || '').trim(),
  secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || '').trim(),
};

/** true = fichiers stockes sur Cloudflare R2 ; false = sur le disque (dev/tests). */
export const modeR2 = Boolean(CFG.bucket && CFG.endpoint && CFG.accessKeyId && CFG.secretAccessKey);

let client = null;
let PutObjectCommand;
let DeleteObjectCommand;
let GetObjectCommand;
let signer;

if (modeR2) {
  const s3 = await import('@aws-sdk/client-s3');
  signer = await import('@aws-sdk/s3-request-presigner');
  PutObjectCommand = s3.PutObjectCommand;
  DeleteObjectCommand = s3.DeleteObjectCommand;
  GetObjectCommand = s3.GetObjectCommand;
  client = new s3.S3Client({
    region: 'auto',
    endpoint: CFG.endpoint,
    credentials: { accessKeyId: CFG.accessKeyId, secretAccessKey: CFG.secretAccessKey },
  });
}

/**
 * Depose un fichier televerse dans le stockage :
 * - R2 : envoi vers le bucket puis suppression du fichier temporaire local
 * - local : rien a faire (le fichier est deja au bon endroit)
 *
 * @param {string} cheminLocal chemin absolu du fichier temporaire (multer)
 * @param {string} nomStocke    nom retenu comme cle (/uploads/<nomStocke>)
 * @param {string} contentType  type MIME du fichier
 */
export async function envoyerVersStockage(cheminLocal, nomStocke, contentType) {
  if (!modeR2) return;
  await client.send(
    new PutObjectCommand({
      Bucket: CFG.bucket,
      Key: nomStocke,
      Body: fs.createReadStream(cheminLocal),
      ContentType: contentType || 'application/octet-stream',
    })
  );
  await fs.promises.unlink(cheminLocal).catch(() => {});
}

/**
 * Supprime un fichier du stockage (R2 ou disque local) — idempotent.
 * @param {string} nomStocke nom du fichier (basename de l'url /uploads/...)
 */
export async function supprimerFichier(nomStocke) {
  if (!nomStocke) return;
  const cle = path.basename(nomStocke);
  if (modeR2) {
    await client.send(new DeleteObjectCommand({ Bucket: CFG.bucket, Key: cle }));
    return;
  }
  await fs.promises.rm(path.join(dossierUploads, cle), { force: true });
}

/**
 * URL de telechargement du fichier :
 * - R2 : URL signee (validee 12 h, renouvelee a chaque demande)
 * - local : route /uploads/ du serveur
 */
export async function urlPresignee(nomStocke) {
  const cle = path.basename(nomStocke);
  if (!modeR2) return `/uploads/${cle}`;
  return signer.getSignedUrl(client, new GetObjectCommand({ Bucket: CFG.bucket, Key: cle }), {
    expiresIn: 12 * 3600,
  });
}
