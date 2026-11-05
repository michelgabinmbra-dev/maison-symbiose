/**
 * Rôles et accès (voir cahier des charges, section "Rôles et accès").
 * Le rôle de chaque personne est lu dans la feuille Utilisateurs (colonnes Email, Role, Nom),
 * jamais codé en dur, pour pouvoir ajouter/retirer des comptes sans toucher au code.
 */

// Email de la personne connectée via l'application (jeton de session), fixé par api() le temps
// d'un appel. Hors application (éditeur, déclencheurs), on retombe sur le compte Google.
let EMAIL_SESSION = null;

function getEmailUtilisateurCourant() {
  return EMAIL_SESSION || Session.getActiveUser().getEmail();
}

/** Renvoie {email, role, nom} pour la personne connectée, ou null si elle n'est pas enregistrée. */
function getUtilisateurCourant() {
  const email = getEmailUtilisateurCourant();
  return trouverUtilisateurParEmail(email);
}

function trouverUtilisateurParEmail(email) {
  if (!email) return null;
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.UTILISATEURS);
  const lignes = feuille.getDataRange().getValues();
  const entetes = lignes[0];
  const colEmail = entetes.indexOf('Email');
  const colRole = entetes.indexOf('Role');
  const colNom = entetes.indexOf('Nom');

  for (let i = 1; i < lignes.length; i++) {
    if (String(lignes[i][colEmail]).toLowerCase() === String(email).toLowerCase()) {
      if (lignes[i][entetes.indexOf('Actif')] === false) return null;
      const colDroits = entetes.indexOf('Droits');
      const droits = colDroits === -1 ? [] : String(lignes[i][colDroits] || '').split(/[,;]+/).map((d) => d.trim()).filter(Boolean);
      return { email: lignes[i][colEmail], role: lignes[i][colRole], nom: lignes[i][colNom], droits };
    }
  }
  return null;
}

/**
 * Droits en plus du rôle (colonne Droits de Utilisateurs, séparés par des virgules), par exemple
 * « Groupes » pour l'ingénieur qui compose les groupes de maintenance chaque mois.
 */
const DROITS = { GROUPES: 'Groupes' };

function aLeDroit(utilisateur, droit) {
  return !!utilisateur && (utilisateur.droits || []).some((d) => d.toLowerCase() === droit.toLowerCase());
}

/** Comme exigerRole, mais accepte aussi les personnes qui ont le droit indiqué. */
function exigerRoleOuDroit(rolesAutorises, droit) {
  const utilisateur = getUtilisateurCourant();
  if (utilisateur && aLeDroit(utilisateur, droit)) return utilisateur;
  return exigerRole(rolesAutorises);
}

/** Emails des personnes actives qui ont un droit donné. */
function emailsAvecDroit(droit) {
  return lireLignes(NOMS_FEUILLES.UTILISATEURS)
    .filter((u) => u.Email && u.Actif !== false && String(u.Droits || '').split(/[,;]+/).some((d) => d.trim().toLowerCase() === droit.toLowerCase()))
    .map((u) => u.Email);
}

/** Lève une erreur si la personne connectée n'a pas un des rôles autorisés. */
function exigerRole(rolesAutorises) {
  const utilisateur = getUtilisateurCourant();
  if (!utilisateur) {
    throw new Error("Accès refusé : compte non enregistré dans Maison Symbiose (" + getEmailUtilisateurCourant() + ").");
  }
  if (rolesAutorises.indexOf(utilisateur.role) === -1) {
    throw new Error("Accès refusé : rôle '" + utilisateur.role + "' non autorisé pour cette action.");
  }
  return utilisateur;
}
