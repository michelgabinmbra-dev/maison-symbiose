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
 * margeVisee, tauxCommission, tauxImpot en % du marché, tous optionnels (30/10/10 par défaut).
 * Ensuite, ajouterLigneDevis() construit la proforma ligne par ligne.
 */
function creerDevis(numeroAffaire, coutEstime, margeVisee, tauxCommission, tauxImpot) {
  const utilisateur = exigerRole(Object.values(ROLES));
  trouverAffaire(numeroAffaire); // lève une erreur si l'affaire n'existe pas

  if (margeVisee == null || margeVisee === '') {
    margeVisee = MARGE_NETTE_DEFAUT;
  }
  coutEstime = Number(coutEstime) || 0; // 0 si le devis est construit ligne par ligne

  const commission = tauxCommission == null || tauxCommission === '' ? TAUX_COMMISSION_DEFAUT : Number(tauxCommission);
  const impot = tauxImpot == null || tauxImpot === '' ? TAUX_IMPOT_DEFAUT : Number(tauxImpot);
  const prixPropose = ventilerPrix(coutEstime, margeVisee, commission, impot);

  const feuille = getFeuilleDonnees(NOMS_FEUILLES.DEVIS);
  const numeroDevis = genererNumero('DEV', feuille, 'NumeroDevis');
  feuille.appendRow([
    numeroDevis, numeroAffaire, coutEstime, margeVisee, prixPropose,
    STATUTS_DEVIS.EN_ATTENTE, '', '', commission, impot, margeVisee,
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

// ---------- Lignes de la proforma ----------
// Chaque ligne reçoit un prix calculé avec la marge du devis, mais le DG/DGA peut le corriger à
// la main (la ventilation n'est pas forcément uniforme). Une ligne corrigée n'est plus recalculée
// automatiquement ; le devis affiche la marge nette RÉELLE qui en résulte.

/** Ajoute une ligne à un devis, avec un prix unitaire calculé. Renvoie le numéro de la ligne. */
function ajouterLigneDevis(numeroDevis, designation, quantite, coutUnitaire) {
  exigerRole(Object.values(ROLES));
  if (!designation || !(Number(quantite) > 0) || coutUnitaire == null) {
    throw new Error('Désignation, quantité positive et coût unitaire sont obligatoires.');
  }
  const devis = ligneVersObjet(trouverDevis(numeroDevis).entetes, trouverDevis(numeroDevis).ligne);
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.LIGNES_DEVIS);
  const numeroLigne = lireLignes(NOMS_FEUILLES.LIGNES_DEVIS)
    .filter((l) => l.NumeroDevis === numeroDevis).length + 1;
  const prixUnitaire = ventilerPrix(coutUnitaire, devis.MargeVisee, devis.TauxCommission, devis.TauxImpot);
  feuille.appendRow([numeroDevis, numeroLigne, designation, Number(quantite), Number(coutUnitaire), prixUnitaire, false]);
  recalculerDevis(numeroDevis);
  return numeroLigne;
}

/** Corrige à la main le prix unitaire d'une ligne (DG ou DGA). */
function modifierPrixLigne(numeroDevis, numeroLigne, prixUnitaire) {
  exigerRole([ROLES.DG, ROLES.DGA]);
  if (!(Number(prixUnitaire) >= 0)) {
    throw new Error('Prix unitaire invalide : ' + prixUnitaire);
  }
  const resultat = trouverLigneDevis(numeroDevis, numeroLigne);
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.LIGNES_DEVIS);
  majCellule(feuille, resultat, 'PrixUnitaire', Number(prixUnitaire));
  majCellule(feuille, resultat, 'PrixModifieMain', true);
  return recalculerDevis(numeroDevis);
}

/**
 * Change la marge, la commission ou l'impôt d'un devis (DG ou DGA) et recalcule les lignes non
 * corrigées à la main. Passer reinitialiser = true pour recalculer aussi les lignes corrigées.
 */
function changerTauxDevis(numeroDevis, margeVisee, tauxCommission, tauxImpot, reinitialiser) {
  exigerRole([ROLES.DG, ROLES.DGA]);
  const feuilleDevis = getFeuilleDonnees(NOMS_FEUILLES.DEVIS);
  const resultat = trouverDevis(numeroDevis);
  if (margeVisee != null && margeVisee !== '') majCellule(feuilleDevis, resultat, 'MargeVisee', Number(margeVisee));
  if (tauxCommission != null && tauxCommission !== '') majCellule(feuilleDevis, resultat, 'TauxCommission', Number(tauxCommission));
  if (tauxImpot != null && tauxImpot !== '') majCellule(feuilleDevis, resultat, 'TauxImpot', Number(tauxImpot));

  const devis = ligneVersObjet(trouverDevis(numeroDevis).entetes, trouverDevis(numeroDevis).ligne);
  const feuilleLignes = getFeuilleDonnees(NOMS_FEUILLES.LIGNES_DEVIS);
  const valeurs = feuilleLignes.getDataRange().getValues();
  const entetes = valeurs[0];
  for (let i = 1; i < valeurs.length; i++) {
    const ligne = ligneVersObjet(entetes, valeurs[i]);
    if (ligne.NumeroDevis !== numeroDevis || (ligne.PrixModifieMain === true && !reinitialiser)) {
      continue;
    }
    const position = { index: i + 1, ligne: valeurs[i], entetes };
    majCellule(feuilleLignes, position, 'PrixUnitaire',
      ventilerPrix(ligne.CoutUnitaire, devis.MargeVisee, devis.TauxCommission, devis.TauxImpot));
    majCellule(feuilleLignes, position, 'PrixModifieMain', false);
  }
  return recalculerDevis(numeroDevis);
}

/** Remet à jour les totaux du devis depuis ses lignes et renvoie le détail (marge réelle comprise). */
function recalculerDevis(numeroDevis) {
  const lignes = lireLignes(NOMS_FEUILLES.LIGNES_DEVIS).filter((l) => l.NumeroDevis === numeroDevis);
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.DEVIS);
  const resultat = trouverDevis(numeroDevis);
  const devis = ligneVersObjet(resultat.entetes, resultat.ligne);

  const cout = lignes.reduce((s, l) => s + Number(l.Quantite) * Number(l.CoutUnitaire), 0);
  const prix = lignes.reduce((s, l) => s + Number(l.Quantite) * Number(l.PrixUnitaire), 0);
  const commission = Math.round(prix * Number(devis.TauxCommission) / 100);
  const impot = Math.round(prix * Number(devis.TauxImpot) / 100);
  const beneficeNet = prix - cout - commission - impot;
  const margeReelle = prix > 0 ? Math.round(beneficeNet / prix * 1000) / 10 : 0;

  majCellule(feuille, resultat, 'CoutEstime', cout);
  majCellule(feuille, resultat, 'PrixPropose', prix);
  majCellule(feuille, resultat, 'MargeReelle', margeReelle);
  return {
    lignes, cout, prix, commission, impot, beneficeNet, margeReelle,
    margeVisee: Number(devis.MargeVisee),
  };
}

function trouverLigneDevis(numeroDevis, numeroLigne) {
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.LIGNES_DEVIS);
  const valeurs = feuille.getDataRange().getValues();
  const entetes = valeurs[0];
  for (let i = 1; i < valeurs.length; i++) {
    const ligne = ligneVersObjet(entetes, valeurs[i]);
    if (ligne.NumeroDevis === numeroDevis && Number(ligne.NumeroLigne) === Number(numeroLigne)) {
      return { index: i + 1, ligne: valeurs[i], entetes };
    }
  }
  throw new Error('Ligne ' + numeroLigne + ' introuvable sur le devis ' + numeroDevis);
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
