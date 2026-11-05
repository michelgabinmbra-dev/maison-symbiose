/**
 * Cycle de vie d'une affaire (= un marché, quel que soit le client : AFG, UCP-FM, PNLP,
 * réhabilitation avec architectes...). Un seul processus pour tous (validé par Michel le
 * 04/11/2026) : Nouvelle demande -> Devis -> (validé -> Exécution -> Facture -> Réception ->
 * Paiement) ou (à revoir -> nouveau devis) ou (sans suite -> Abandonnée).
 * Pas de rôle commercial distinct : toute l'équipe, techniciens compris, peut créer une demande.
 */

const STATUTS_AFFAIRE = {
  NOUVELLE_DEMANDE: 'Nouvelle demande',
  CONFIRMEE: 'Confirmée par le client',
  PROGRAMMEE: 'Programmée',
  DEVIS_A_REVOIR: 'Devis à revoir',
  DEVIS_VALIDE: 'Devis validé',
  EN_EXECUTION: 'En exécution',
  FACTURE_EMISE: 'Facture émise',
  RECEPTION_CONFIRMEE: 'Réception confirmée',
  PAYEE: 'Payée',
  ABANDONNEE: 'Abandonnée',
  CLOTUREE: 'Clôturée (contrat)',
};

/** Client sous contrat de maintenance (colonne TypeContrat contenant « maintenance ») : curatif et préventif ne se facturent pas. */
function clientSousContrat(nomClient) {
  const c = lireLignes(NOMS_FEUILLES.CLIENTS).filter((x) => x.NomClient === nomClient)[0];
  return !!c && /maintenance/i.test(String(c.TypeContrat || ''));
}

/** Affaire couverte par le contrat : maintenance curative ou préventive d'un client sous contrat. */
function estSousContrat(affaire) {
  return [TYPES_INTERVENTION.CURATIF, TYPES_INTERVENTION.PREVENTIF].indexOf(affaire.TypeIntervention) !== -1
    && String(affaire.AFacturer || '').toLowerCase() !== 'oui' && clientSousContrat(affaire.Client);
}

/** Clôture d'une affaire sous contrat (DG, DGA, ou chef d'équipe avec le droit Planning) : il faut au moins un rapport. */
function cloturerAffaireContrat(numeroAffaire) {
  exigerRoleOuDroit([ROLES.DG, ROLES.DGA], DROITS.PLANNING);
  const r = trouverAffaire(numeroAffaire);
  const a = ligneVersObjet(r.entetes, r.ligne);
  if (!estSousContrat(a)) throw new Error('Cette affaire n\'est pas couverte par le contrat (ou elle est marquée à facturer) : elle passe par proforma et facture.');
  if (!rapportsDeLAffaire(numeroAffaire).length) throw new Error('Fais d\'abord le rapport d\'intervention.');
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.AFFAIRES);
  majCellule(feuille, r, 'Statut', STATUTS_AFFAIRE.CLOTUREE);
  majCellule(feuille, r, 'Avancement', 100);
  majCellule(feuille, r, 'DateMaj', new Date());
}

/**
 * Crée une nouvelle affaire (demande) pour un client/site.
 * @param {object} details {client, site, typeIntervention, source, priorite, groupe, titre, description, agent}
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
    details.titre || '',
    details.description || '',
    details.agent || '',
    0, '', '', '', new Date(),
  ]);
  return numero;
}

/**
 * Met à jour le suivi d'une affaire (ce qui alimente le point de situation client) :
 * {avancement (0-100), blocage, prochaineAction, delaiPrevu, agent, titre, description}.
 * Seuls les champs fournis sont modifiés.
 */
function mettreAJourSuivi(numeroAffaire, suivi) {
  exigerRole(Object.values(ROLES));
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.AFFAIRES);
  const resultat = trouverAffaire(numeroAffaire);
  const champs = {
    avancement: 'Avancement', blocage: 'Blocage', prochaineAction: 'ProchaineAction',
    delaiPrevu: 'DelaiPrevu', agent: 'Agent', titre: 'Titre', description: 'Description',
  };
  Object.keys(champs).forEach((cle) => {
    if (suivi[cle] === undefined) return;
    let valeur = suivi[cle];
    if (cle === 'avancement') valeur = Math.max(0, Math.min(100, Number(valeur) || 0));
    if (cle === 'delaiPrevu' && valeur) valeur = new Date(valeur);
    majCellule(feuille, resultat, champs[cle], valeur);
  });
  majCellule(feuille, resultat, 'DateMaj', new Date());
}

/** Change la priorité d'une affaire (DG ou DGA) : sert à trier la vue "urgences". */
function definirPrioriteAffaire(numeroAffaire, priorite) {
  exigerRole([ROLES.DG, ROLES.DGA]);
  if (Object.values(PRIORITES).indexOf(priorite) === -1) {
    throw new Error('Priorité invalide : ' + priorite);
  }
  majCellule(getFeuilleDonnees(NOMS_FEUILLES.AFFAIRES), trouverAffaire(numeroAffaire), 'Priorite', priorite);
}

/** Change le type d'une affaire (DG ou DGA) : maintenance curative, préventive, travaux, sécurité. */
function definirTypeAffaire(numeroAffaire, type) {
  exigerRole([ROLES.DG, ROLES.DGA]);
  if (Object.values(TYPES_INTERVENTION).indexOf(type) === -1) throw new Error('Type invalide : ' + type);
  majCellule(getFeuilleDonnees(NOMS_FEUILLES.AFFAIRES), trouverAffaire(numeroAffaire), 'TypeIntervention', type);
}

/** Renvoie les affaires non closes, triées par priorité (Élevée d'abord), toutes sources confondues. */
function listerUrgences() {
  exigerRole(Object.values(ROLES));
  const ordrePriorite = { 'Élevée': 0, 'Moyenne': 1, 'Faible': 2, '': 3 };
  const statutsClos = [STATUTS_AFFAIRE.PAYEE, STATUTS_AFFAIRE.ABANDONNEE, STATUTS_AFFAIRE.CLOTUREE];

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
