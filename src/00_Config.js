/**
 * Constantes partagées par tout le projet Maison Symbiose.
 * Voir le cahier des charges : https://claude.ai/artifact/EDZDqJNBmGUYdNLLcrN7AP
 */

const ROLES = {
  DG: 'DG',
  DGA: 'DGA',
  TECHNICIEN: 'TECHNICIEN',
  COMPTABILITE: 'COMPTABILITE',
  STOCK: 'STOCK', // Jean, référent stock
};

const NOMS_FEUILLES = {
  UTILISATEURS: 'Utilisateurs',
  AFFAIRES: 'Affaires',
  DEVIS: 'Devis',
  FACTURES: 'Factures',
  STOCK_OUTILLAGE: 'Stock_Outillage',
  STOCK_MATERIEL: 'Stock_Materiel',
  MOUVEMENTS_OUTILLAGE: 'Mouvements_Outillage',
  MOUVEMENTS_MATERIEL: 'Mouvements_Materiel',
};

const PROP_ID_CLASSEUR = 'ID_CLASSEUR_DONNEES';

/** Email de test utilisé tant qu'aucun compte réel n'est enregistré dans Utilisateurs. */
const DELAI_PAIEMENT_JOURS_DEFAUT = 15;
const DELAI_ALERTE_RETOUR_OUTIL_JOURS = 1; // alerte à Jean si non rendu à J+1
