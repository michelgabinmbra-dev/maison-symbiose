/**
 * Rôles et accès (voir cahier des charges, section "Rôles et accès").
 * Le rôle de chaque personne est lu dans la feuille Utilisateurs (colonnes Email, Role, Nom),
 * jamais codé en dur, pour pouvoir ajouter/retirer des comptes sans toucher au code.
 */

/** Email de la personne connectée à l'exécution du script. */
function getEmailUtilisateurCourant() {
  return Session.getActiveUser().getEmail();
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
