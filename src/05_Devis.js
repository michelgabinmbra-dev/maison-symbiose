/**
 * Devis : coûts, écarts, marge (voir cahier des charges, section "Devis").
 * La marge visée est le bénéfice NET (après commission et impôt) divisé par le montant du
 * marché, réglable par devis (en général 30-35 %). Commission et impôt sont aussi des % du
 * marché (10 % par défaut chacun, modifiables par devis). D'où :
 *   prix = coût / (1 - marge - commission - impôt).
 */

const STATUTS_DEVIS = {
  EN_ATTENTE: 'En attente',
  VALIDE: 'Validé',
  A_REVOIR: 'À revoir',
  ABANDONNE: 'Abandonné',
};

/**
 * Crée un devis sur une affaire existante et calcule le prix proposé. Renvoie son numéro.
 * margeVisee, tauxCommission, tauxImpot en % du marché ; les deux derniers sont optionnels.
 */
function creerDevis(numeroAffaire, coutEstime, margeVisee, tauxCommission, tauxImpot) {
  const utilisateur = exigerRole(Object.values(ROLES));
  trouverAffaire(numeroAffaire); // lève une erreur si l'affaire n'existe pas

  if (coutEstime == null || margeVisee == null) {
    throw new Error('coutEstime et margeVisee sont obligatoires.');
  }

  const commission = tauxCommission == null || tauxCommission === '' ? TAUX_COMMISSION_DEFAUT : Number(tauxCommission);
  const impot = tauxImpot == null || tauxImpot === '' ? TAUX_IMPOT_DEFAUT : Number(tauxImpot);
  const prixPropose = ventilerPrix(coutEstime, margeVisee, commission, impot);

  const feuille = getFeuilleDonnees(NOMS_FEUILLES.DEVIS);
  const numeroDevis = genererNumero('DEV', feuille, 'NumeroDevis');
  feuille.appendRow([
    numeroDevis, numeroAffaire, coutEstime, margeVisee, prixPropose,
    STATUTS_DEVIS.EN_ATTENTE, '', '', commission, impot,
  ]);

  changerStatutAffaire(numeroAffaire, STATUTS_AFFAIRE.NOUVELLE_DEMANDE);
  return numeroDevis;
}

/** Prix tel qu'après commission, impôt et coûts, il reste exactement la marge nette visée. */
function ventilerPrix(coutEstime, margeVisee, tauxCommission, tauxImpot) {
  const partRestante = 1 - (Number(margeVisee) + Number(tauxCommission) + Number(tauxImpot)) / 100;
  if (partRestante <= 0) {
    throw new Error('Marge + commission + impôt doivent rester sous 100 %.');
  }
  return Math.round(Number(coutEstime) / partRestante);
}

/** Détail d'un prix : commission, impôt et bénéfice net, pour l'écran proforma. */
function detaillerPrix(coutEstime, margeVisee, tauxCommission, tauxImpot) {
  const commission = tauxCommission == null ? TAUX_COMMISSION_DEFAUT : Number(tauxCommission);
  const impot = tauxImpot == null ? TAUX_IMPOT_DEFAUT : Number(tauxImpot);
  const prix = ventilerPrix(coutEstime, margeVisee, commission, impot);
  const montantCommission = Math.round(prix * commission / 100);
  const montantImpot = Math.round(prix * impot / 100);
  return {
    prix,
    commission: montantCommission,
    impot: montantImpot,
    beneficeNet: prix - Number(coutEstime) - montantCommission - montantImpot,
  };
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
