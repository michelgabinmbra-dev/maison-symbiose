/**
 * Connexion à l'application par email + code personnel (choix de Michel du 04/11/2026) :
 * un seul lien pour tous, sans compte Google. Michel saisit le code (4 à 6 chiffres) dans la
 * colonne CodeAcces de la feuille Utilisateurs ; à la première connexion il est remplacé par son
 * empreinte (le code n'est alors plus lisible dans la feuille).
 */

const DUREE_SESSION_JOURS = 30;
const ESSAIS_MAX = 5;
const PREFIXE_SESSION = 'session_';

function connexion(email, code) {
  email = String(email || '').trim().toLowerCase();
  code = String(code || '').trim();
  if (!email || !code) {
    throw new Error('Email et code obligatoires.');
  }
  const cache = CacheService.getScriptCache();
  const cleEssais = 'essais_' + email;
  const essais = Number(cache.get(cleEssais)) || 0;
  if (essais >= ESSAIS_MAX) {
    throw new Error('Trop d\'essais. Réessaie dans 15 minutes.');
  }

  const feuille = getFeuilleDonnees(NOMS_FEUILLES.UTILISATEURS);
  const valeurs = feuille.getDataRange().getValues();
  const entetes = valeurs[0];
  let trouve = null;
  for (let i = 1; i < valeurs.length; i++) {
    if (String(valeurs[i][entetes.indexOf('Email')]).trim().toLowerCase() === email) {
      trouve = { index: i + 1, ligne: valeurs[i], entetes };
      break;
    }
  }

  const stocke = trouve ? String(trouve.ligne[entetes.indexOf('CodeAcces')] || '') : '';
  const actif = trouve && trouve.ligne[entetes.indexOf('Actif')] !== false;
  const estEmpreinte = /^[0-9a-f]{64}$/.test(stocke);
  const valide = actif && stocke && (estEmpreinte ? stocke === empreinteCode(code) : stocke === code);
  if (!valide) {
    cache.put(cleEssais, String(essais + 1), 15 * 60);
    throw new Error('Email ou code incorrect.');
  }
  cache.remove(cleEssais);
  if (!estEmpreinte) {
    majCellule(feuille, trouve, 'CodeAcces', empreinteCode(code));
  }

  const jeton = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(PREFIXE_SESSION + jeton, JSON.stringify({
    email, expire: Date.now() + DUREE_SESSION_JOURS * 24 * 3600 * 1000,
  }));
  nettoyerSessionsExpirees();
  const utilisateur = trouverUtilisateurParEmail(email);
  return { jeton, utilisateur };
}

function deconnexion(jeton) {
  PropertiesService.getScriptProperties().deleteProperty(PREFIXE_SESSION + jeton);
}

/** Renvoie l'email lié au jeton, ou lève SESSION_EXPIREE. */
function resoudreSession(jeton) {
  const brut = jeton && PropertiesService.getScriptProperties().getProperty(PREFIXE_SESSION + jeton);
  if (!brut) {
    throw new Error('SESSION_EXPIREE');
  }
  const session = JSON.parse(brut);
  if (session.expire < Date.now()) {
    deconnexion(jeton);
    throw new Error('SESSION_EXPIREE');
  }
  return session.email;
}

/** Fixe ou change le code d'une personne (DG ou DGA, ou la personne elle-même). */
function definirCodeAcces(email, nouveauCode) {
  const utilisateur = exigerRole(Object.values(ROLES));
  const estChef = utilisateur.role === ROLES.DG || utilisateur.role === ROLES.DGA;
  if (!estChef && String(utilisateur.email).toLowerCase() !== String(email).toLowerCase()) {
    throw new Error('Tu ne peux changer que ton propre code.');
  }
  if (!/^\d{4,6}$/.test(String(nouveauCode))) {
    throw new Error('Le code doit faire 4 à 6 chiffres.');
  }
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.UTILISATEURS);
  const resultat = trouverLigneParValeur(feuille, 'Email', email);
  if (!resultat) {
    throw new Error('Utilisateur introuvable : ' + email);
  }
  majCellule(feuille, resultat, 'CodeAcces', empreinteCode(nouveauCode));
}

function empreinteCode(code) {
  const proprietes = PropertiesService.getScriptProperties();
  let sel = proprietes.getProperty('SEL_CODES');
  if (!sel) {
    sel = Utilities.getUuid();
    proprietes.setProperty('SEL_CODES', sel);
  }
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sel + ':' + code)
    .map((o) => ('0' + (o & 0xff).toString(16)).slice(-2)).join('');
}

function nettoyerSessionsExpirees() {
  const proprietes = PropertiesService.getScriptProperties();
  const toutes = proprietes.getProperties();
  Object.keys(toutes).forEach((cle) => {
    if (cle.indexOf(PREFIXE_SESSION) !== 0) return;
    try {
      if (JSON.parse(toutes[cle]).expire < Date.now()) proprietes.deleteProperty(cle);
    } catch (e) {
      proprietes.deleteProperty(cle);
    }
  });
}
