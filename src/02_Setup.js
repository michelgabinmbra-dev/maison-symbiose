/**
 * Création et accès au classeur de données de Maison Symbiose.
 * Un seul classeur Google Sheets sert de base de données, comme pour le GMAO.
 * Son ID est stocké dans les propriétés du script (jamais codé en dur).
 */

/**
 * À exécuter depuis l'éditeur Apps Script (menu Exécuter) pour créer le classeur de données
 * s'il n'existe pas encore, puis pour créer toute feuille qui manquerait encore (idempotent :
 * sans effet sur les feuilles déjà là, donc peut être relancée après l'ajout d'une nouvelle
 * feuille dans ce fichier).
 */
function initialiserBaseDeDonnees() {
  const proprietes = PropertiesService.getScriptProperties();
  let classeur;
  if (proprietes.getProperty(PROP_ID_CLASSEUR)) {
    classeur = SpreadsheetApp.openById(proprietes.getProperty(PROP_ID_CLASSEUR));
  } else {
    classeur = SpreadsheetApp.create('Maison Symbiose - Données');
    proprietes.setProperty(PROP_ID_CLASSEUR, classeur.getId());
  }

  const feuilleUtilisateurs = creerFeuilleSiAbsente(classeur, NOMS_FEUILLES.UTILISATEURS, ['Email', 'Nom', 'Role', 'Actif', 'CodeAcces', 'Telephone']);
  if (feuilleUtilisateurs && feuilleUtilisateurs.getLastRow() < 2) {
    feuilleUtilisateurs.appendRow(['michelgabinmbra@gmail.com', 'Michel', ROLES.DG, true]);
  }

  creerFeuilleSiAbsente(classeur, NOMS_FEUILLES.CLIENTS, ['NomClient', 'TypeContrat', 'ContactEmail']);
  creerFeuilleSiAbsente(classeur, NOMS_FEUILLES.SITES, ['NomSite', 'NomClient', 'Ville']);

  creerFeuilleSiAbsente(classeur, NOMS_FEUILLES.AFFAIRES, [
    'NumeroAffaire', 'Client', 'Site', 'TypeIntervention', 'Source', 'Priorite',
    'Groupe', 'Statut', 'DateCreation', 'CreePar', 'Titre', 'Description', 'Agent',
    'Avancement', 'Blocage', 'ProchaineAction', 'DelaiPrevu', 'DateMaj',
  ]);
  creerFeuilleSiAbsente(classeur, NOMS_FEUILLES.DEVIS, [
    'NumeroDevis', 'NumeroAffaire', 'CoutEstime', 'MargeVisee', 'PrixPropose',
    'Statut', 'ValidePar', 'DateValidation', 'TauxCommission', 'TauxImpot', 'MargeReelle',
  ]);
  creerFeuilleSiAbsente(classeur, NOMS_FEUILLES.LIGNES_DEVIS, [
    'NumeroDevis', 'NumeroLigne', 'Designation', 'Quantite', 'CoutUnitaire', 'PrixUnitaire',
    'PrixModifieMain',
  ]);
  creerFeuilleSiAbsente(classeur, NOMS_FEUILLES.FACTURES, [
    'NumeroFacture', 'NumeroAffaire', 'Montant', 'DateEmission', 'DelaiPaiementJours',
    'StatutPaiement', 'DateReception', 'DatePaiement',
  ]);
  creerFeuilleSiAbsente(classeur, NOMS_FEUILLES.DEPENSES, [
    'NumeroDepense', 'NumeroAffaire', 'Categorie', 'Montant', 'Date', 'Description', 'CreePar',
  ]);

  creerFeuilleSiAbsente(classeur, NOMS_FEUILLES.VEHICULES, ['Immatriculation', 'Marque', 'Modele']);
  creerFeuilleSiAbsente(classeur, NOMS_FEUILLES.MOUVEMENTS_VEHICULE, [
    'Immatriculation', 'Conducteur', 'Action', 'Kilometrage', 'VilleParcourue', 'PhotoUrl', 'Date',
  ]);

  creerFeuilleSiAbsente(classeur, NOMS_FEUILLES.STOCK_OUTILLAGE, ['Outil', 'Lieu', 'Statut', 'DerniereMaj']);
  creerFeuilleSiAbsente(classeur, NOMS_FEUILLES.STOCK_MATERIEL, ['Materiel', 'Quantite', 'PrixUnitaire']);
  creerFeuilleSiAbsente(classeur, NOMS_FEUILLES.MOUVEMENTS_OUTILLAGE, [
    'Outil', 'Agent', 'Action', 'Date', 'LieuDeclare', 'ConfirmeParJean',
  ]);
  creerFeuilleSiAbsente(classeur, NOMS_FEUILLES.MOUVEMENTS_MATERIEL, [
    'Materiel', 'NumeroAffaire', 'Agent', 'QuantiteSortie', 'QuantitePosee',
    'QuantiteRapportee', 'Date',
  ]);

  // La feuille par défaut créée par Sheets ("Sheet1") n'est plus utile.
  const feuilleParDefaut = classeur.getSheetByName('Sheet1') || classeur.getSheetByName('Feuille 1');
  if (feuilleParDefaut && classeur.getSheets().length > 1) {
    classeur.deleteSheet(feuilleParDefaut);
  }

  Logger.log('Classeur prêt : ' + classeur.getUrl());
}

/** Crée la feuille si elle n'existe pas déjà ; ne touche jamais à une feuille existante. */
function creerFeuilleSiAbsente(classeur, nom, entetes) {
  const existante = classeur.getSheetByName(nom);
  if (existante) {
    return existante;
  }
  const feuille = classeur.insertSheet(nom);
  feuille.getRange(1, 1, 1, entetes.length).setValues([entetes]).setFontWeight('bold');
  feuille.setFrozenRows(1);
  return feuille;
}

function getClasseurDonnees() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_ID_CLASSEUR);
  if (!id) {
    throw new Error("Base de données non initialisée : exécute d'abord initialiserBaseDeDonnees().");
  }
  return SpreadsheetApp.openById(id);
}

function getFeuilleDonnees(nom) {
  const feuille = getClasseurDonnees().getSheetByName(nom);
  if (!feuille) {
    throw new Error("Feuille introuvable : " + nom + ". Relance initialiserBaseDeDonnees() pour la créer.");
  }
  return feuille;
}
