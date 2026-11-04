/**
 * Cycle de vie d'une affaire (= un marché, quel que soit le client : AFG, UCP-FM, PNLP,
 * réhabilitation avec architectes...). Un seul processus pour tous (validé par Michel le
 * 04/11/2026) : Nouvelle demande -> Devis -> (validé -> Exécution -> Facture -> Réception ->
 * Paiement) ou (à revoir -> nouveau devis) ou (sans suite -> Abandonnée).
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

/**
 * Crée une nouvelle affaire (demande) pour un client/site.
 * @param {object} details {client, site, typeIntervention, source, priorite, groupe}
 *   - typeIntervention : une valeur de TYPES_INTERVENTION (Préventif/Curatif/Travaux/Sécurité)
 *   - source : une valeur de SOURCES_DEMANDE (Mail/Appel/Planifié)
 *   - priorite : une valeur de PRIORITES (Élevée/Moyenne/Faible), optionnelle pour le préventif planifié
 *   - groupe : nom du groupe technique assigné, optionnel
 * Renvoie le numéro de l'affaire créée.
 */
function creerDemande(details) {
  const utilisateur = exigerRole(Object.values(ROLES));
  if (!details || !details.client) {
    throw new Error('Le client est obligatoire.');
  }
  if (!details.typeIntervention || !details.source) {
    throw new Error('typeIntervention et source sont obligatoires.');
  }

  const feuille = getFeuilleDonnees(NOMS_FEUILLES.AFFAIRES);
  const numero = genererNumero('AFF', feuille, 'NumeroAffaire');
  feuille.appendRow([
    numero,
    details.client,
    details.site || '',
    details.typeIntervention,
    details.source,
    details.priorite || '',
    details.groupe || '',
    STATUTS_AFFAIRE.NOUVELLE_DEMANDE,
    new Date(),
    utilisateur.email,
  ]);
  return numero;
}

/** Change la priorité d'une affaire (DG ou DGA) : sert à trier la vue "urgences". */
function definirPrioriteAffaire(numeroAffaire, priorite) {
  exigerRole([ROLES.DG, ROLES.DGA]);
  if (Object.values(PRIORITES).indexOf(priorite) === -1) {
    throw new Error('Priorité invalide : ' + priorite);
  }
  majCellule(getFeuilleDonnees(NOMS_FEUILLES.AFFAIRES), trouverAffaire(numeroAffaire), 'Priorite', priorite);
}

/** Renvoie les affaires non closes, triées par priorité (Élevée d'abord), toutes sources confondues. */
function listerUrgences() {
  exigerRole(Object.values(ROLES));
  const ordrePriorite = { 'Élevée': 0, 'Moyenne': 1, 'Faible': 2, '': 3 };
  const statutsClos = [STATUTS_AFFAIRE.PAYEE, STATUTS_AFFAIRE.ABANDONNEE];

  const feuille = getFeuilleDonnees(NOMS_FEUILLES.AFFAIRES);
  const valeurs = feuille.getDataRange().getValues();
  const entetes = valeurs[0];
  const colStatut = entetes.indexOf('Statut');
  const colPriorite = entetes.indexOf('Priorite');

  return valeurs.slice(1)
    .filter((ligne) => statutsClos.indexOf(ligne[colStatut]) === -1)
    .sort((a, b) => (ordrePriorite[a[colPriorite]] ?? 3) - (ordrePriorite[b[colPriorite]] ?? 3))
    .map((ligne) => ligneVersObjet(entetes, ligne));
}

function ligneVersObjet(entetes, ligne) {
  const objet = {};
  entetes.forEach((entete, i) => { objet[entete] = ligne[i]; });
  return objet;
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
