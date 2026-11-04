/**
 * Devis : coûts, écarts, marge (voir cahier des charges, section "Devis").
 * Pas de seuil de marge fixe : Michel donne la marge visée (un montant), l'outil calcule le
 * prix à proposer. À confirmer avec Michel : la marge visée est ici traitée comme un MONTANT
 * (prixPropose = coutEstime + margeVisee), pas un pourcentage — à ajuster si besoin.
 */

const STATUTS_DEVIS = {
  EN_ATTENTE: 'En attente',
  VALIDE: 'Validé',
  A_REVOIR: 'À revoir',
  ABANDONNE: 'Abandonné',
};

/** Crée un devis sur une affaire existante et calcule le prix proposé. Renvoie son numéro. */
function creerDevis(numeroAffaire, coutEstime, margeVisee) {
  const utilisateur = exigerRole(Object.values(ROLES));
  trouverAffaire(numeroAffaire); // lève une erreur si l'affaire n'existe pas

  if (coutEstime == null || margeVisee == null) {
    throw new Error('coutEstime et margeVisee sont obligatoires.');
  }

  const prixPropose = ventilerPrix(coutEstime, margeVisee);

  const feuille = getFeuilleDonnees(NOMS_FEUILLES.DEVIS);
  const numeroDevis = genererNumero('DEV', feuille, 'NumeroDevis');
  feuille.appendRow([
    numeroDevis, numeroAffaire, coutEstime, margeVisee, prixPropose,
    STATUTS_DEVIS.EN_ATTENTE, '', '',
  ]);

  changerStatutAffaire(numeroAffaire, STATUTS_AFFAIRE.NOUVELLE_DEMANDE);
  return numeroDevis;
}

/** Calcule le prix à proposer au client à partir du coût estimé et de la marge visée. */
function ventilerPrix(coutEstime, margeVisee) {
  return coutEstime + margeVisee;
}

/** Valide un devis (DG ou DGA) : l'affaire peut passer en exécution. */
function validerDevis(numeroDevis) {
  const utilisateur = exigerRole([ROLES.DG, ROLES.DGA]);
  const resultat = trouverDevis(numeroDevis);
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.DEVIS);

  majCellule(feuille, resultat, 'Statut', STATUTS_DEVIS.VALIDE);
  majCellule(feuille, resultat, 'ValidePar', utilisateur.email);
  majCellule(feuille, resultat, 'DateValidation', new Date());

  const colonneAffaire = resultat.entetes.indexOf('NumeroAffaire');
  changerStatutAffaire(resultat.ligne[colonneAffaire], STATUTS_AFFAIRE.DEVIS_VALIDE);
}

/** Renvoie un devis en révision (DG ou DGA) : un nouveau devis devra être créé sur la même affaire. */
function demanderRevisionDevis(numeroDevis) {
  exigerRole([ROLES.DG, ROLES.DGA]);
  const resultat = trouverDevis(numeroDevis);
  majCellule(getFeuilleDonnees(NOMS_FEUILLES.DEVIS), resultat, 'Statut', STATUTS_DEVIS.A_REVOIR);

  const colonneAffaire = resultat.entetes.indexOf('NumeroAffaire');
  changerStatutAffaire(resultat.ligne[colonneAffaire], STATUTS_AFFAIRE.DEVIS_A_REVOIR);
}

function trouverDevis(numeroDevis) {
  const resultat = trouverLigneParValeur(getFeuilleDonnees(NOMS_FEUILLES.DEVIS), 'NumeroDevis', numeroDevis);
  if (!resultat) {
    throw new Error('Devis introuvable : ' + numeroDevis);
  }
  return resultat;
}
