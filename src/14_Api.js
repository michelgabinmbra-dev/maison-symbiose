/**
 * Application web (téléphone d'abord) : sert l'interface et expose une seule porte d'entrée,
 * api(jeton, action, args), qui vérifie la session puis appelle une fonction autorisée.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Maison Symbiose')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

const ACTIONS_API = {
  // Écrans
  ecranAccueil: () => ecranAccueil(),
  listeAffaires: (a) => listeAffaires(a.tout),
  ecranAffaire: (a) => ecranAffaire(a.numero),
  ecranVehicules: () => ecranVehicules(),
  ecranMateriel: () => ecranMateriel(),
  ecranArgent: (a) => ecranArgent(a.debut, a.fin),
  listeClients: () => listeClients(),
  pointDeSituation: (a) => pointDeSituation(a.client),
  // Affaires
  creerDemande: (a) => creerDemande(a),
  definirPriorite: (a) => definirPrioriteAffaire(a.numero, a.priorite),
  mettreAJourSuivi: (a) => mettreAJourSuivi(a.numero, a.suivi),
  corrigerClient: (a) => corrigerClientAffaire(a.numero, a.client, a.site),
  changerStatut: (a) => changerStatutParChef(a.numero, a.statut),
  enregistrerDepense: (a) => enregistrerDepense(a.numero, a.categorie, a.montant, a.description),
  // Proforma
  creerDevis: (a) => creerDevis(a.numero, 0, a.marge, a.commission, a.impot),
  ajouterLigneDevis: (a) => ajouterLigneDevis(a.devis, a.designation, a.quantite, a.cout),
  modifierPrixLigne: (a) => modifierPrixLigne(a.devis, a.ligne, a.prix),
  changerTauxDevis: (a) => changerTauxDevis(a.devis, a.marge, a.commission, a.impot, a.reinitialiser),
  validerDevis: (a) => validerDevis(a.devis),
  pdfProforma: (a) => pdfProforma(a.devis),
  envoyerProforma: (a) => envoyerProforma(a.devis),
  pdfPointDeSituation: (a) => pdfPointDeSituation(a.client),
  envoyerPointDeSituation: (a) => envoyerPointDeSituation(a.client),
  // Rapports d'intervention
  creerRapport: (a) => creerRapport(a.numero, a.rapport),
  pdfRapport: (a) => pdfRapport(a.rapport),
  envoyerRapport: (a) => envoyerRapport(a.rapport),
  // Maintenance préventive par groupes
  ecranPreventif: () => ecranPreventif(),
  ficheVisite: (a) => ficheVisite(a.numero),
  planifierPreventif: (a) => planifierPreventif(a.details),
  enregistrerVisite: (a) => enregistrerVisitePreventive(a.numero, a.fiche),
  // Facture et paiements
  emettreFacture: (a) => emettreFacture(a.numero, { bonCommande: a.bonCommande, delaiJours: a.delaiJours }),
  deposerFacture: (a) => deposerFacture(a.facture, a.date),
  enregistrerPaiement: (a) => enregistrerPaiement(a.facture, a.montant, a.mode, a.reference, a.date),
  pdfFacture: (a) => pdfFacture(a.facture),
  envoyerFacture: (a) => envoyerFacture(a.facture),
  // Véhicules, matériel
  prendreVehicule: (a) => prendreVehicule(a.immatriculation, '', Number(a.kilometrage), a.photo),
  deposerVehicule: (a) => deposerVehicule(a.immatriculation, '', Number(a.kilometrage), a.ville, a.photo),
  prendreOutil: (a) => prendreOutil(a.outil, a.lieu),
  rendreOutil: (a) => rendreOutil(a.outil, a.lieu),
  sortirMateriel: (a) => sortirMateriel(a.materiel, a.numero, a.quantite),
  declarerRetourMateriel: (a) => declarerRetourMateriel(a.materiel, a.numero, a.posee, a.rapportee),
  // Compte
  changerMonCode: (a) => definirCodeAcces(getEmailUtilisateurCourant(), a.code),
};

/** Seule fonction appelée par l'interface (avec connexion/deconnexion). */
function api(jeton, action, args) {
  EMAIL_SESSION = resoudreSession(jeton);
  const fonction = ACTIONS_API[action];
  if (!fonction) {
    throw new Error('Action inconnue : ' + action);
  }
  const resultat = fonction(args || {});
  return resultat === undefined ? null : JSON.parse(JSON.stringify(resultat));
}

function connexionApp(email, code) {
  return JSON.parse(JSON.stringify(connexion(email, code)));
}

function deconnexionApp(jeton) {
  deconnexion(jeton);
}

// ---------- Données des écrans ----------

function ecranAccueil() {
  const utilisateur = exigerRole(Object.values(ROLES));
  const affaires = lireLignes(NOMS_FEUILLES.AFFAIRES);
  const ouvertes = affaires.filter((a) => STATUTS_CLOS.indexOf(a.Statut) === -1);
  const facturesEnRetard = lireLignes(NOMS_FEUILLES.FACTURES)
    .filter((f) => f.StatutPaiement !== STATUTS_PAIEMENT.PAYEE && situationFacture(f).joursDeRetard > 0);

  return {
    utilisateur,
    compteurs: {
      aTraiter: ouvertes.filter((a) => a.Statut === STATUTS_AFFAIRE.NOUVELLE_DEMANDE).length,
      urgences: ouvertes.filter((a) => a.Priorite === PRIORITES.ELEVEE).length,
      facturesEnRetard: facturesEnRetard.length,
      enExecution: ouvertes.filter((a) => a.Statut === STATUTS_AFFAIRE.EN_EXECUTION).length,
    },
    urgences: listerUrgences().slice(0, 30).map(resumerAffaire),
  };
}

function listeAffaires(tout) {
  exigerRole(Object.values(ROLES));
  return lireLignes(NOMS_FEUILLES.AFFAIRES)
    .filter((a) => tout || STATUTS_CLOS.indexOf(a.Statut) === -1)
    .sort((a, b) => b.DateCreation - a.DateCreation)
    .map(resumerAffaire);
}

function resumerAffaire(a) {
  return {
    numero: a.NumeroAffaire, client: a.Client, site: a.Site, type: a.TypeIntervention,
    source: a.Source, priorite: a.Priorite, statut: a.Statut, titre: a.Titre || a.TypeIntervention,
    date: a.DateCreation, avancement: Number(a.Avancement) || 0, agent: a.Agent,
  };
}

function ecranAffaire(numero) {
  const utilisateur = exigerRole(Object.values(ROLES));
  const resultat = trouverAffaire(numero);
  const affaire = ligneVersObjet(resultat.entetes, resultat.ligne);
  const tousDevis = lireLignes(NOMS_FEUILLES.DEVIS).filter((d) => d.NumeroAffaire === numero);
  const devis = tousDevis[tousDevis.length - 1] || null;
  const voitFinances = [ROLES.DG, ROLES.DGA, ROLES.COMPTABILITE].indexOf(utilisateur.role) !== -1;

  return {
    affaire,
    devis: devis && voitFinances ? devis : (devis ? { NumeroDevis: devis.NumeroDevis, Statut: devis.Statut } : null),
    lignes: devis && voitFinances
      ? lireLignes(NOMS_FEUILLES.LIGNES_DEVIS).filter((l) => l.NumeroDevis === devis.NumeroDevis)
      : [],
    depenses: lireLignes(NOMS_FEUILLES.DEPENSES).filter((d) => d.NumeroAffaire === numero),
    bilan: voitFinances ? bilanAffaire(numero) : null,
    peutGerer: utilisateur.role === ROLES.DG || utilisateur.role === ROLES.DGA,
    voitFinances,
    statuts: Object.values(STATUTS_AFFAIRE),
    categories: Object.values(CATEGORIES_DEPENSE),
    facture: voitFinances ? ficheFacture(numero) : null,
    modesPaiement: MODES_PAIEMENT,
    rapports: rapportsDeLAffaire(numero),
    domaines: DOMAINES_RAPPORT,
    etatsControle: ETATS_CONTROLE,
  };
}

function ficheFacture(numeroAffaire) {
  const f = factureDeLAffaire(numeroAffaire);
  if (!f) return null;
  return Object.assign({}, f, situationFacture(f), { paiements: paiementsDeLaFacture(f.NumeroFacture) });
}

function changerStatutParChef(numero, statut) {
  exigerRole([ROLES.DG, ROLES.DGA, ROLES.COMPTABILITE]);
  if (Object.values(STATUTS_AFFAIRE).indexOf(statut) === -1) {
    throw new Error('Statut invalide : ' + statut);
  }
  changerStatutAffaire(numero, statut);
}

function listeClients() {
  exigerRole(Object.values(ROLES));
  const sites = lireLignes(NOMS_FEUILLES.SITES);
  const noms = lireLignes(NOMS_FEUILLES.CLIENTS).map((c) => c.NomClient);
  lireLignes(NOMS_FEUILLES.AFFAIRES).forEach((a) => { if (a.Client && noms.indexOf(a.Client) === -1) noms.push(a.Client); });
  return noms.map((nom) => ({ nom, sites: sites.filter((s) => s.NomClient === nom).map((s) => s.NomSite) }));
}

function ecranVehicules() {
  exigerRole(Object.values(ROLES));
  const mouvements = lireLignes(NOMS_FEUILLES.MOUVEMENTS_VEHICULE);
  return lireLignes(NOMS_FEUILLES.VEHICULES).map((v) => {
    const siens = mouvements.filter((m) => m.Immatriculation === v.Immatriculation).sort((a, b) => b.Date - a.Date);
    const dernier = siens[0];
    return {
      immatriculation: v.Immatriculation, marque: v.Marque, modele: v.Modele,
      sorti: !!dernier && dernier.Action === ACTIONS_VEHICULE.PRISE,
      conducteur: dernier ? dernier.Conducteur : '',
      dernierKm: dernier ? Number(dernier.Kilometrage) : null,
      dateDernier: dernier ? dernier.Date : null,
    };
  });
}

function ecranMateriel() {
  exigerRole(Object.values(ROLES));
  const mouvementsMateriel = lireLignes(NOMS_FEUILLES.MOUVEMENTS_MATERIEL);
  return {
    outils: lireLignes(NOMS_FEUILLES.STOCK_OUTILLAGE).map((o) => ({ outil: o.Outil, lieu: o.Lieu, statut: o.Statut })),
    nonRendus: listerOutilsNonRendus(),
    materiel: lireLignes(NOMS_FEUILLES.STOCK_MATERIEL).map((m) => ({ materiel: m.Materiel, quantite: m.Quantite })),
    sortiesEnCours: mouvementsMateriel.filter((m) => m.QuantitePosee === ''),
    ecarts: mouvementsMateriel.filter((m) => m.QuantitePosee !== ''
      && Number(m.QuantitePosee) + Number(m.QuantiteRapportee) !== Number(m.QuantiteSortie)),
  };
}

function ecranArgent(debut, fin) {
  exigerRole(ROLES_LECTURE_FINANCES);
  const clients = {};
  lireLignes(NOMS_FEUILLES.AFFAIRES).forEach((a) => { if (a.Client) clients[a.Client] = true; });
  const parClient = Object.keys(clients)
    .map((c) => bilanClientSurPeriode(c, debut, fin))
    .filter((b) => b.affaires.length > 0);
  const total = parClient.reduce((t, b) => ({
    facture: t.facture + b.recettesFacturees,
    encaisse: t.encaisse + b.encaisse,
    benefice: t.benefice + b.beneficeNet,
  }), { facture: 0, encaisse: 0, benefice: 0 });
  const depenses = depensesEntreprise(debut, fin);
  return {
    parClient, depenses,
    aEncaisser: facturesAEncaisser(),
    total: Object.assign(total, {
      depenses: depenses.total,
      beneficeNetEntreprise: total.benefice - (depenses.parAffaire['Hors marché'] || 0),
    }),
  };
}
