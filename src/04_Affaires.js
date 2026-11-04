/**
 * Cycle de vie d'une affaire (voir cahier des charges, section "Cycle de vie d'une affaire") :
 * Nouvelle demande -> Devis -> (validé -> Exécution -> Facture -> Réception -> Paiement)
 *                            -> (à revoir -> nouveau devis) ou (sans suite -> Abandonnée)
 * Pas de rôle commercial distinct : toute l'équipe, techniciens compris, peut créer une demande.
 */

const STATUTS_AFFAIRE = {
  NOUVELLE_DEMANDE: 'Nouvelle demande',
  DEVIS_A_REVOIR: 'Devis à revoir',
  DEVIS_VALIDE: 'Devis validé',
  EN_EXECUTION: 'En exécution',
  FACTURE_EMISE: 'Facture émise',
  RECEPTION_CONFIRMEE: 'Réception confirmée',
  PAYEE: 'Payée',
  ABANDONNEE: 'Abandonnée',
};

/** Crée une nouvelle affaire (demande) pour un client. Renvoie son numéro. */
function creerDemande(client) {
  const utilisateur = exigerRole(Object.values(ROLES));
  if (!client) {
    throw new Error('Le nom du client est obligatoire.');
  }

  const feuille = getFeuilleDonnees(NOMS_FEUILLES.AFFAIRES);
  const numero = genererNumero('AFF', feuille, 'NumeroAffaire');
  feuille.appendRow([numero, client, STATUTS_AFFAIRE.NOUVELLE_DEMANDE, new Date(), utilisateur.email]);
  return numero;
}

/** Abandonne une affaire, à n'importe quelle étape avant le paiement. */
function abandonnerAffaire(numeroAffaire) {
  exigerRole([ROLES.DG, ROLES.DGA]);
  const resultat = trouverAffaire(numeroAffaire);
  majCellule(getFeuilleDonnees(NOMS_FEUILLES.AFFAIRES), resultat, 'Statut', STATUTS_AFFAIRE.ABANDONNEE);
}

function trouverAffaire(numeroAffaire) {
  const resultat = trouverLigneParValeur(getFeuilleDonnees(NOMS_FEUILLES.AFFAIRES), 'NumeroAffaire', numeroAffaire);
  if (!resultat) {
    throw new Error('Affaire introuvable : ' + numeroAffaire);
  }
  return resultat;
}

function changerStatutAffaire(numeroAffaire, nouveauStatut) {
  majCellule(getFeuilleDonnees(NOMS_FEUILLES.AFFAIRES), trouverAffaire(numeroAffaire), 'Statut', nouveauStatut);
}
