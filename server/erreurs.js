import { Router } from 'express';

/**
 * Express 4 n'attrape pas les promesses rejetees : ce wrapper fait
 * passer les erreurs async des handlers au middleware d'erreur central.
 */
function envelopper(fn) {
  return (req, res, next) => {
    try {
      const sortie = fn(req, res, next);
      if (sortie && typeof sortie.catch === 'function') sortie.catch(next);
    } catch (e) {
      next(e);
    }
  };
}

/**
 * Enveloppe toutes les routes/middlewares ajoutes ULTERIEUREMENT sur ce
 * router (a appeler juste apres sa creation, avant toute definition).
 */
export function capterErreurs(router) {
  for (const methode of ['get', 'post', 'put', 'delete', 'patch', 'all', 'use']) {
    const original = router[methode];
    router[methode] = function (...args) {
      return original.apply(
        this,
        args.map((a) => (typeof a === 'function' ? envelopper(a) : a))
      );
    };
  }
  return router;
}

/** Middleware d'erreur central : reponse JSON propre, sans stacktrace. */
export function erreurHttp(err, _req, res, _next) {
  console.error('[Erreur serveur]', err);
  res.status(err.status || 500).json({ erreur: 'Erreur interne du serveur.' });
}

/** Nouveau router deja enveloppe (equivalent de Router()). */
export function routerProtege() {
  return capterErreurs(Router());
}
