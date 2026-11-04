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
      return { email: lignes[i][colEmail], role: lignes[i][colRole], nom: lignes[i][colNom] };
    }
  }
  return null;
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
