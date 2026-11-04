/**
 * Création et accès au classeur de données de Maison Symbiose.
 * Un seul classeur Google Sheets sert de base de données, comme pour le GMAO.
 * Son ID est stocké dans les propriétés du script (jamais codé en dur).
 */

/**
 * À exécuter une seule fois (depuis l'éditeur Apps Script, menu Exécuter) pour créer
 * le classeur de données et toutes ses feuilles. Sans effet si le classeur existe déjà.
 */
function initialiserBaseDeDonnees() {
  const proprietes = PropertiesService.getScriptProperties();
  if (proprietes.getProperty(PROP_ID_CLASSEUR)) {
    Logger.log('Classeur déjà initialisé : ' + proprietes.getProperty(PROP_ID_CLASSEUR));
    return;
  }

  const classeur = SpreadsheetApp.create('Maison Symbiose - Données');
  proprietes.setProperty(PROP_ID_CLASSEUR, classeur.getId());

  creerFeuille(classeur, NOMS_FEUILLES.UTILISATEURS, ['Email', 'Nom', 'Role', 'Actif']);
  creerFeuille(classeur, NOMS_FEUILLES.AFFAIRES, [
    'NumeroAffaire', 'Client', 'Statut', 'DateCreation', 'CreePar',
  ]);
  creerFeuille(classeur, NOMS_FEUILLES.DEVIS, [
    'NumeroDevis', 'NumeroAffaire', 'CoutEstime', 'MargeVisee', 'PrixPropose',
    'Statut', 'ValidePar', 'DateValidation',
  ]);
  creerFeuille(classeur, NOMS_FEUILLES.FACTURES, [
    'NumeroFacture', 'NumeroAffaire', 'Montant', 'DateEmission', 'DelaiPaiementJours',
    'StatutPaiement', 'DateReception', 'DatePaiement',
  ]);
  creerFeuille(classeur, NOMS_FEUILLES.STOCK_OUTILLAGE, ['Outil', 'Lieu', 'Statut', 'DerniereMaj']);
  creerFeuille(classeur, NOMS_FEUILLES.STOCK_MATERIEL, ['Materiel', 'Quantite', 'PrixUnitaire']);
  creerFeuille(classeur, NOMS_FEUILLES.MOUVEMENTS_OUTILLAGE, [
    'Outil', 'Agent', 'Action', 'Date', 'LieuDeclare', 'ConfirmeParJean',
  ]);
  creerFeuille(classeur, NOMS_FEUILLES.MOUVEMENTS_MATERIEL, [
    'Materiel', 'NumeroAffaire', 'Agent', 'QuantiteSortie', 'QuantitePosee',
    'QuantiteRapportee', 'Date',
  ]);

  // La feuille par défaut créée par Sheets ("Sheet1") n'est plus utile.
  const feuilleParDefaut = classeur.getSheetByName('Sheet1') || classeur.getSheetByName('Feuille 1');
  if (feuilleParDefaut && classeur.getSheets().length > 1) {
    classeur.deleteSheet(feuilleParDefaut);
  }

  Logger.log('Classeur créé : ' + classeur.getUrl());
}

function creerFeuille(classeur, nom, entetes) {
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
    throw new Error("Feuille introuvable : " + nom);
  }
  return feuille;
}
