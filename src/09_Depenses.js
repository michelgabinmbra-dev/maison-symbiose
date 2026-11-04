/**
 * Dépenses et bénéfice : chaque dépense est rattachée à une affaire (un marché), ou laissée sans
 * affaire pour les frais généraux de l'entreprise. Bénéfice net d'un marché = montant facturé
 * (ou, à défaut de facture, prix du devis validé) - dépenses - commission - impôt ; la marge
 * nette = ce bénéfice ÷ montant du marché, à comparer à la marge visée du devis. Pour un contrat de
 * maintenance trimestriel, on additionne toutes les affaires du client sur la période.
 */

const CATEGORIES_DEPENSE = {
  MATERIEL: 'Matériel',
  MAIN_OEUVRE: "Main d'œuvre",
  TRANSPORT: 'Transport / carburant',
  SOUS_TRAITANCE: 'Sous-traitance',
  FRAIS_GENERAUX: 'Frais généraux',
  AUTRE: 'Autre',
};

const ROLES_LECTURE_FINANCES = [ROLES.DG, ROLES.DGA, ROLES.COMPTABILITE];

/**
 * Enregistre une dépense. numeroAffaire vide = dépense de l'entreprise, hors marché.
 * Renvoie le numéro de la dépense.
 */
function enregistrerDepense(numeroAffaire, categorie, montant, description, date) {
  const utilisateur = exigerRole(Object.values(ROLES));
  if (Object.values(CATEGORIES_DEPENSE).indexOf(categorie) === -1) {
    throw new Error('Catégorie de dépense invalide : ' + categorie);
  }
  if (!(Number(montant) > 0)) {
    throw new Error('Le montant doit être un nombre positif.');
  }
  if (numeroAffaire) {
    trouverAffaire(numeroAffaire);
  }

  const feuille = getFeuilleDonnees(NOMS_FEUILLES.DEPENSES);
  const numero = genererNumero('DEP', feuille, 'NumeroDepense');
  feuille.appendRow([
    numero, numeroAffaire || '', categorie, Number(montant), date ? new Date(date) : new Date(),
    description || '', utilisateur.email,
  ]);
  return numero;
}

/** Recettes, dépenses (détaillées par catégorie) et bénéfice d'une affaire. */
function bilanAffaire(numeroAffaire) {
  exigerRole(ROLES_LECTURE_FINANCES);
  trouverAffaire(numeroAffaire);
  return calculerBilan([numeroAffaire]);
}

/**
 * Bilan d'un client sur une période (ex. un contrat de maintenance de 3 mois) : toutes ses
 * affaires créées entre dateDebut et dateFin incluses.
 */
function bilanClientSurPeriode(client, dateDebut, dateFin) {
  exigerRole(ROLES_LECTURE_FINANCES);
  const debut = debutDeJournee(dateDebut);
  const fin = finDeJournee(dateFin);

  const affaires = lireLignes(NOMS_FEUILLES.AFFAIRES)
    .filter((a) => a.Client === client && a.DateCreation >= debut && a.DateCreation <= fin)
    .map((a) => a.NumeroAffaire);

  const bilan = calculerBilan(affaires);
  bilan.client = client;
  bilan.affaires = affaires;
  return bilan;
}

/** Toutes les dépenses de l'entreprise sur une période, par catégorie et par marché. */
function depensesEntreprise(dateDebut, dateFin) {
  exigerRole(ROLES_LECTURE_FINANCES);
  const debut = debutDeJournee(dateDebut);
  const fin = finDeJournee(dateFin);

  const depenses = lireLignes(NOMS_FEUILLES.DEPENSES)
    .filter((d) => d.Date >= debut && d.Date <= fin);

  const parCategorie = {};
  const parAffaire = {};
  let total = 0;
  depenses.forEach((d) => {
    const montant = Number(d.Montant) || 0;
    const affaire = d.NumeroAffaire || 'Hors marché';
    parCategorie[d.Categorie] = (parCategorie[d.Categorie] || 0) + montant;
    parAffaire[affaire] = (parAffaire[affaire] || 0) + montant;
    total += montant;
  });
  return { total, parCategorie, parAffaire, nombre: depenses.length };
}

function calculerBilan(numerosAffaires) {
  const numeros = new Set(numerosAffaires);

  const depenses = lireLignes(NOMS_FEUILLES.DEPENSES).filter((d) => numeros.has(d.NumeroAffaire));
  const depensesParCategorie = {};
  let totalDepenses = 0;
  depenses.forEach((d) => {
    const montant = Number(d.Montant) || 0;
    depensesParCategorie[d.Categorie] = (depensesParCategorie[d.Categorie] || 0) + montant;
    totalDepenses += montant;
  });

  const factures = lireLignes(NOMS_FEUILLES.FACTURES).filter((f) => numeros.has(f.NumeroAffaire));
  const devisValides = lireLignes(NOMS_FEUILLES.DEVIS)
    .filter((d) => numeros.has(d.NumeroAffaire) && d.Statut === STATUTS_DEVIS.VALIDE);

  // Une affaire facturée compte pour sa facture ; sinon pour son devis validé (recette prévue).
  // Commission et impôt (en % du marché) viennent du devis validé, sinon des taux par défaut.
  let recettes = 0;
  let recettesPrevues = 0;
  let commissions = 0;
  let impots = 0;
  numeros.forEach((numero) => {
    const devis = devisValides.filter((d) => d.NumeroAffaire === numero);
    const dernierDevis = devis[devis.length - 1];
    const tauxCommission = dernierDevis && dernierDevis.TauxCommission !== '' && dernierDevis.TauxCommission != null
      ? Number(dernierDevis.TauxCommission) : TAUX_COMMISSION_DEFAUT;
    const tauxImpot = dernierDevis && dernierDevis.TauxImpot !== '' && dernierDevis.TauxImpot != null
      ? Number(dernierDevis.TauxImpot) : TAUX_IMPOT_DEFAUT;

    const facturesAffaire = factures.filter((f) => f.NumeroAffaire === numero);
    let montantMarche;
    if (facturesAffaire.length > 0) {
      montantMarche = facturesAffaire.reduce((somme, f) => somme + (Number(f.Montant) || 0), 0);
      recettes += montantMarche;
    } else {
      montantMarche = devis.reduce((somme, d) => somme + (Number(d.PrixPropose) || 0), 0);
      recettesPrevues += montantMarche;
    }
    commissions += montantMarche * tauxCommission / 100;
    impots += montantMarche * tauxImpot / 100;
  });

  const encaisse = factures
    .filter((f) => f.StatutPaiement === 'Payée')
    .reduce((somme, f) => somme + (Number(f.Montant) || 0), 0);

  const montantTotal = recettes + recettesPrevues;
  const beneficeNet = montantTotal - totalDepenses - commissions - impots;
  return {
    recettesFacturees: recettes,
    recettesPrevues,
    encaisse,
    totalDepenses,
    depensesParCategorie,
    commissions: Math.round(commissions),
    impots: Math.round(impots),
    beneficeNet: Math.round(beneficeNet),
    margeNettePourcent: montantTotal > 0 ? Math.round(beneficeNet / montantTotal * 1000) / 10 : null,
  };
}

function lireLignes(nomFeuille) {
  const valeurs = getFeuilleDonnees(nomFeuille).getDataRange().getValues();
  const entetes = valeurs[0];
  return valeurs.slice(1).map((ligne) => ligneVersObjet(entetes, ligne));
}

function debutDeJournee(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function finDeJournee(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}
