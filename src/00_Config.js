/**
 * Constantes partagées par tout le projet Maison Symbiose.
 * Cahier des charges (en cours de refonte, 04/11/2026) : https://claude.ai/artifact/EDZDqJNBmGUYdNLLcrN7AP
 */

const ROLES = {
  DG: 'DG',
  DGA: 'DGA',
  TECHNICIEN: 'TECHNICIEN',
  COMPTABILITE: 'COMPTABILITE',
  STOCK: 'STOCK', // Jean, référent matériel/outillage
  VEHICULES: 'VEHICULES', // référent véhicules (distinct de Jean)
};

const NOMS_FEUILLES = {
  UTILISATEURS: 'Utilisateurs',
  CLIENTS: 'Clients',
  SITES: 'Sites',
  AFFAIRES: 'Affaires',
  DEVIS: 'Devis',
  FACTURES: 'Factures',
  DEPENSES: 'Depenses',
  VEHICULES: 'Vehicules',
  MOUVEMENTS_VEHICULE: 'Mouvements_Vehicule',
  STOCK_OUTILLAGE: 'Stock_Outillage',
  STOCK_MATERIEL: 'Stock_Materiel',
  MOUVEMENTS_OUTILLAGE: 'Mouvements_Outillage',
  MOUVEMENTS_MATERIEL: 'Mouvements_Materiel',
};

const TYPES_INTERVENTION = {
  PREVENTIF: 'Préventif',
  CURATIF: 'Curatif',
  TRAVAUX: 'Travaux',
  SECURITE: 'Sécurité',
};

const SOURCES_DEMANDE = {
  MAIL: 'Mail',
  APPEL: 'Appel',
  PLANIFIE: 'Planifié', // maintenance préventive planifiée, pas une demande reçue
};

const PRIORITES = {
  ELEVEE: 'Élevée',
  MOYENNE: 'Moyenne',
  FAIBLE: 'Faible',
};

const PROP_ID_CLASSEUR = 'ID_CLASSEUR_DONNEES';

const DELAI_PAIEMENT_JOURS_DEFAUT = 15;
const DELAI_ALERTE_RETOUR_OUTIL_JOURS = 1; // alerte à Jean si non rendu à J+1
