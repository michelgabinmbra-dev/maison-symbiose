/**
 * Qui est en ligne : chaque appel de l'application note l'heure de la dernière activité de la
 * personne (cache du script, 6 h). « En ligne » = actif dans les 5 dernières minutes ; l'appli
 * ouverte envoie un signe de vie toutes les 2 minutes. Visible par le DG et le DGA.
 */

const MINUTES_EN_LIGNE = 5;
const CLE_PRESENCE = 'presence';

function lirePresence() {
  try { return JSON.parse(CacheService.getScriptCache().get(CLE_PRESENCE) || '{}'); } catch (e) { return {}; }
}

/** Note l'activité (au plus une écriture par minute et par personne). */
function noterPresence(email) {
  if (!email) return;
  email = String(email).toLowerCase();
  const p = lirePresence();
  const maintenant = Date.now();
  if (p[email] && maintenant - p[email] < 60e3) return;
  p[email] = maintenant;
  // On ne garde que les 6 dernières heures.
  Object.keys(p).forEach((k) => { if (maintenant - p[k] > 6 * 3600e3) delete p[k]; });
  CacheService.getScriptCache().put(CLE_PRESENCE, JSON.stringify(p), 21600);
}

/** Liste de l'équipe : en ligne d'abord, puis vus dans les 6 dernières heures. */
function personnesEnLigne() {
  exigerRole([ROLES.DG, ROLES.DGA]);
  return resumePresence();
}

function resumePresence() {
  const p = lirePresence();
  const maintenant = Date.now();
  const equipe = lireLignes(NOMS_FEUILLES.UTILISATEURS).filter((u) => u.Email && u.Actif !== false);
  const personnes = equipe.map((u) => {
    const t = p[String(u.Email).toLowerCase()];
    const minutes = t ? Math.floor((maintenant - t) / 60e3) : null;
    return { nom: u.Nom || u.Email, role: u.Role, fonction: u.Fonction || '', enLigne: minutes !== null && minutes < MINUTES_EN_LIGNE, minutes };
  });
  // Michel a deux comptes (Gmail et @symbioz.cc) : on dédoublonne par nom.
  const vus = {};
  const liste = personnes.sort((a, b) => (a.minutes === null ? 1e9 : a.minutes) - (b.minutes === null ? 1e9 : b.minutes))
    .filter((x) => { const k = String(x.nom).toLowerCase(); if (vus[k]) return false; vus[k] = true; return true; });
  return { enLigne: liste.filter((x) => x.enLigne).length, total: liste.length, personnes: liste };
}
