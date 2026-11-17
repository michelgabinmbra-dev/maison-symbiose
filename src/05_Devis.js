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
// Le DG/DGA saisit lui-même ses montants (quantité, coût, prix) et les corrige quand il veut.
// L'appli ne réécrit jamais un prix : elle affiche seulement la commission, l'impôt, le bénéfice
// et la marge nette qui résultent des montants saisis, et un prix conseillé à titre indicatif.

/**
 * Ajoute une ligne à un devis. Le prix unitaire est celui saisi (la main reste au DG/DGA) ;
 * s'il est laissé vide, on prend le prix conseillé pour la marge repère du devis.
 * Renvoie le numéro de la ligne.
 */
function ajouterLigneDevis(numeroDevis, designation, quantite, coutUnitaire, prixUnitaire) {
  exigerRole(Object.values(ROLES));
  if (!designation || !(Number(quantite) > 0) || coutUnitaire == null || coutUnitaire === '') {
    throw new Error('Désignation, quantité positive et coût unitaire sont obligatoires.');
  }
  const devis = ligneVersObjet(trouverDevis(numeroDevis).entetes, trouverDevis(numeroDevis).ligne);
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.LIGNES_DEVIS);
  const numeroLigne = lireLignes(NOMS_FEUILLES.LIGNES_DEVIS)
    .filter((l) => l.NumeroDevis === numeroDevis).length + 1;
  const saisi = prixUnitaire != null && prixUnitaire !== '' && Number(prixUnitaire) >= 0;
  const prix = saisi ? Math.round(Number(prixUnitaire))
    : ventilerPrix(coutUnitaire, devis.MargeVisee, devis.TauxCommission, devis.TauxImpot);
  feuille.appendRow([numeroDevis, numeroLigne, String(designation).trim(), Number(quantite), Number(coutUnitaire), prix, saisi]);
  recalculerDevis(numeroDevis);
  return numeroLigne;
}

/** Corrige à la main le prix unitaire d'une ligne (DG ou DGA). */
function modifierPrixLigne(numeroDevis, numeroLigne, prixUnitaire) {
  return modifierLigneDevis(numeroDevis, numeroLigne, { prix: prixUnitaire });
}

/**
 * Modifie une ligne à la main (DG ou DGA) : désignation, quantité, coût unitaire, prix unitaire.
 * Rien n'est recalculé derrière : les montants restent ceux saisis.
 */
function modifierLigneDevis(numeroDevis, numeroLigne, champs) {
  exigerRole([ROLES.DG, ROLES.DGA]);
  champs = champs || {};
  const resultat = trouverLigneDevis(numeroDevis, numeroLigne);
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.LIGNES_DEVIS);
  const nombre = (v, nom, strict) => {
    const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    if (isNaN(n) || n < 0 || (strict && n === 0)) throw new Error(nom + ' invalide : ' + v);
    return n;
  };
  if (champs.designation != null) {
    if (!String(champs.designation).trim()) throw new Error('La désignation ne peut pas être vide.');
    majCellule(feuille, resultat, 'Designation', String(champs.designation).trim());
  }
  if (champs.quantite != null && champs.quantite !== '') majCellule(feuille, resultat, 'Quantite', nombre(champs.quantite, 'Quantité', true));
  if (champs.cout != null && champs.cout !== '') majCellule(feuille, resultat, 'CoutUnitaire', Math.round(nombre(champs.cout, 'Coût unitaire')));
  if (champs.prix != null && champs.prix !== '') {
    majCellule(feuille, resultat, 'PrixUnitaire', Math.round(nombre(champs.prix, 'Prix unitaire')));
    majCellule(feuille, resultat, 'PrixModifieMain', true);
  }
  return recalculerDevis(numeroDevis);
}

/**
 * Fixe le prix final (total du marché) à la main (DG ou DGA). Les prix unitaires des lignes sont
 * ajustés en proportion pour que la proforma et la facture tombent exactement sur ce total ;
 * l'arrondi restant va sur la ligne la plus chère. Les coûts ne bougent pas.
 */
function fixerPrixTotalDevis(numeroDevis, total) {
  exigerRole([ROLES.DG, ROLES.DGA]);
  const cible = Math.round(Number(String(total).replace(/\s/g, '')));
  if (!(cible >= 0)) throw new Error('Prix final invalide : ' + total);
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.LIGNES_DEVIS);
  const valeurs = feuille.getDataRange().getValues();
  const entetes = valeurs[0];
  const lignes = [];
  for (let i = 1; i < valeurs.length; i++) {
    const l = ligneVersObjet(entetes, valeurs[i]);
    if (l.NumeroDevis === numeroDevis) lignes.push({ position: { index: i + 1, ligne: valeurs[i], entetes }, q: Number(l.Quantite) || 1, p: Number(l.PrixUnitaire) || 0 });
  }
  if (!lignes.length) throw new Error('Ajoute d\'abord au moins une ligne.');
  const actuel = lignes.reduce((s, l) => s + l.q * l.p, 0);
  lignes.forEach((l) => { l.nouveau = actuel > 0 ? Math.round(l.p * cible / actuel) : 0; });
  if (!(actuel > 0)) lignes[0].nouveau = Math.round(cible / lignes[0].q);
  // Arrondi : on corrige sur la ligne au plus gros montant, en restant exact si sa quantité vaut 1.
  const ecart = cible - lignes.reduce((s, l) => s + l.q * l.nouveau, 0);
  if (ecart) {
    const choix = lignes.filter((l) => l.q === 1).sort((a, b) => b.nouveau - a.nouveau)[0]
      || lignes.slice().sort((a, b) => b.q * b.nouveau - a.q * a.nouveau)[0];
    choix.nouveau = Math.max(0, choix.nouveau + Math.round(ecart / choix.q));
  }
  lignes.forEach((l) => {
    majCellule(feuille, l.position, 'PrixUnitaire', l.nouveau);
    majCellule(feuille, l.position, 'PrixModifieMain', true);
  });
  return recalculerDevis(numeroDevis);
}

/** Supprime une ligne (DG ou DGA) et renumérote les suivantes. */
function supprimerLigneDevis(numeroDevis, numeroLigne) {
  exigerRole([ROLES.DG, ROLES.DGA]);
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.LIGNES_DEVIS);
  feuille.deleteRow(trouverLigneDevis(numeroDevis, numeroLigne).index);
  const valeurs = feuille.getDataRange().getValues();
  const entetes = valeurs[0];
  const colDevis = entetes.indexOf('NumeroDevis'), colNum = entetes.indexOf('NumeroLigne');
  for (let i = 1; i < valeurs.length; i++) {
    if (valeurs[i][colDevis] === numeroDevis && Number(valeurs[i][colNum]) > Number(numeroLigne)) {
      feuille.getRange(i + 1, colNum + 1).setValue(Number(valeurs[i][colNum]) - 1);
    }
  }
  return recalculerDevis(numeroDevis);
}

/**
 * Change la marge repère, la commission ou l'impôt d'un devis (DG ou DGA).
 * Les prix des lignes ne bougent JAMAIS : seuls la commission, l'impôt et la marge obtenue
 * affichés sont recalculés à partir des montants saisis.
 */
function changerTauxDevis(numeroDevis, margeVisee, tauxCommission, tauxImpot) {
  exigerRole([ROLES.DG, ROLES.DGA]);
  const feuilleDevis = getFeuilleDonnees(NOMS_FEUILLES.DEVIS);
  const resultat = trouverDevis(numeroDevis);
  const taux = (v, nom) => {
    const n = Number(v);
    if (isNaN(n) || n < 0 || n >= 100) throw new Error(nom + ' invalide : ' + v);
    return n;
  };
  if (margeVisee != null && margeVisee !== '') majCellule(feuilleDevis, resultat, 'MargeVisee', taux(margeVisee, 'Marge'));
  if (tauxCommission != null && tauxCommission !== '') majCellule(feuilleDevis, resultat, 'TauxCommission', taux(tauxCommission, 'Commission'));
  if (tauxImpot != null && tauxImpot !== '') majCellule(feuilleDevis, resultat, 'TauxImpot', taux(tauxImpot, 'Impôt'));
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
