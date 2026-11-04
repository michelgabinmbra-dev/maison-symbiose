/**
 * Facture, suivi du paiement et apurement.
 * Une fois la proforma validée et les travaux faits, la comptabilité (ou le DG/DGA) émet la
 * facture : mêmes lignes que la proforma, papier en-tête, pas de TVA. Le délai de paiement court à
 * partir du dépôt de la facture chez le client (sinon de son émission). Chaque paiement reçu
 * (virement, chèque, espèces), même partiel, est saisi : la facture est apurée quand le reste est
 * à zéro, et l'affaire passe à « Payée ». Chaque matin, les factures en retard sont envoyées par
 * mail à la comptabilité, au DG et au DGA.
 */

const STATUTS_PAIEMENT = {
  EMISE: 'Émise',
  DEPOSEE: 'Déposée chez le client',
  PARTIELLE: 'Partiellement payée',
  PAYEE: 'Payée',
};
const MODES_PAIEMENT = ['Virement', 'Chèque', 'Espèces', 'Mobile money'];
const ROLES_FACTURATION = [ROLES.DG, ROLES.DGA, ROLES.COMPTABILITE];
const PREMIER_NUMERO_FACTURE = 1;

/** Émet la facture d'une affaire à partir de sa dernière proforma validée. Renvoie son numéro. */
function emettreFacture(numeroAffaire, options) {
  const utilisateur = exigerRole(ROLES_FACTURATION);
  options = options || {};
  const ra = trouverAffaire(numeroAffaire);
  const affaire = ligneVersObjet(ra.entetes, ra.ligne);
  if (factureDeLAffaire(numeroAffaire)) {
    throw new Error('Une facture existe déjà pour ' + numeroAffaire + '.');
  }
  const devisValides = lireLignes(NOMS_FEUILLES.DEVIS)
    .filter((d) => d.NumeroAffaire === numeroAffaire && d.Statut === STATUTS_DEVIS.VALIDE);
  const devis = devisValides[devisValides.length - 1];
  if (!devis) {
    throw new Error("La proforma de " + numeroAffaire + " n'est pas encore validée.");
  }
  const lignes = lireLignes(NOMS_FEUILLES.LIGNES_DEVIS).filter((l) => l.NumeroDevis === devis.NumeroDevis);
  const montant = lignes.length ? totalLignes(lignes) : Number(devis.PrixPropose) || 0;
  if (!(montant > 0)) {
    throw new Error('La proforma ' + devis.NumeroDevis + ' est vide : ajoute des lignes avant de facturer.');
  }

  const feuille = getFeuilleDonnees(NOMS_FEUILLES.FACTURES);
  const numero = genererNumero('FAC', feuille, 'NumeroFacture');
  const delai = Number(options.delaiJours) > 0 ? Number(options.delaiJours) : DELAI_PAIEMENT_JOURS_DEFAUT;
  feuille.appendRow([
    numero, numeroAffaire, montant, new Date(), delai, STATUTS_PAIEMENT.EMISE, '', '',
    devis.NumeroDevis, numeroDocumentFacture(affaire.Client), String(options.bonCommande || ''), 0, utilisateur.email,
  ]);
  changerStatutAffaire(numeroAffaire, STATUTS_AFFAIRE.FACTURE_EMISE);
  return numero;
}

/** Numéro officiel de la facture (forme IGS-AGB/ F001/ 26), suite propre aux factures. */
function numeroDocumentFacture(client) {
  const proprietes = PropertiesService.getScriptProperties();
  const verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  try {
    const annee = Utilities.formatDate(new Date(), 'Africa/Abidjan', 'yy');
    const cle = 'NUMERO_FACTURE_' + annee;
    const suivant = Number(proprietes.getProperty(cle) || PREMIER_NUMERO_FACTURE);
    proprietes.setProperty(cle, String(suivant + 1));
    const ligneClient = lireLignes(NOMS_FEUILLES.CLIENTS).filter((c) => c.NomClient === client)[0];
    const code = (ligneClient && ligneClient.CodeDocument) || String(client).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
    return 'IGS-' + code + '/ F' + String(suivant).padStart(3, '0') + '/ ' + annee;
  } finally {
    verrou.releaseLock();
  }
}

function trouverFacture(numeroFacture) {
  const resultat = trouverLigneParValeur(getFeuilleDonnees(NOMS_FEUILLES.FACTURES), 'NumeroFacture', numeroFacture);
  if (!resultat) {
    throw new Error('Facture introuvable : ' + numeroFacture);
  }
  return resultat;
}

function factureDeLAffaire(numeroAffaire) {
  return lireLignes(NOMS_FEUILLES.FACTURES).filter((f) => f.NumeroAffaire === numeroAffaire)[0] || null;
}

/** Échéance, reste à payer et jours de retard d'une facture (objet issu de lireLignes). */
function situationFacture(f) {
  const depart = f.DateReception instanceof Date ? f.DateReception : f.DateEmission;
  const delai = Number(f.DelaiPaiementJours) || DELAI_PAIEMENT_JOURS_DEFAUT;
  const echeance = depart instanceof Date ? new Date(depart.getTime() + delai * 864e5) : null;
  const reste = Math.max(0, (Number(f.Montant) || 0) - (Number(f.MontantEncaisse) || 0));
  const retard = echeance && reste > 0 ? Math.floor((Date.now() - echeance.getTime()) / 864e5) : 0;
  return { echeance, reste, joursDeRetard: retard > 0 ? retard : 0 };
}

/** La facture a été déposée chez le client (accusé de réception) : le délai de paiement court. */
function deposerFacture(numeroFacture, date) {
  exigerRole(ROLES_FACTURATION);
  const resultat = trouverFacture(numeroFacture);
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.FACTURES);
  majCellule(feuille, resultat, 'DateReception', date ? new Date(date) : new Date());
  if (resultat.ligne[resultat.entetes.indexOf('StatutPaiement')] === STATUTS_PAIEMENT.EMISE) {
    majCellule(feuille, resultat, 'StatutPaiement', STATUTS_PAIEMENT.DEPOSEE);
  }
  changerStatutAffaire(resultat.ligne[resultat.entetes.indexOf('NumeroAffaire')], STATUTS_AFFAIRE.RECEPTION_CONFIRMEE);
}

/**
 * Saisit un paiement reçu (même partiel). Quand le reste tombe à zéro, la facture est apurée et
 * l'affaire passe à « Payée ». Renvoie {encaisse, reste, statut}.
 */
function enregistrerPaiement(numeroFacture, montant, mode, reference, date) {
  const utilisateur = exigerRole(ROLES_FACTURATION);
  montant = Number(montant);
  if (!(montant > 0)) {
    throw new Error('Le montant du paiement doit être positif.');
  }
  const verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  try {
    const resultat = trouverFacture(numeroFacture);
    const f = ligneVersObjet(resultat.entetes, resultat.ligne);
    const reste = (Number(f.Montant) || 0) - (Number(f.MontantEncaisse) || 0);
    if (montant > reste + 0.5) {
      throw new Error('Le paiement (' + formaterMontant(montant) + ' F) dépasse le reste à payer (' + formaterMontant(reste) + ' F).');
    }
    const quand = date ? new Date(date) : new Date();
    const paiements = getFeuilleDonnees(NOMS_FEUILLES.PAIEMENTS);
    paiements.appendRow([
      genererNumero('PAI', paiements, 'NumeroPaiement'), numeroFacture, f.NumeroAffaire, quand, montant,
      MODES_PAIEMENT.indexOf(mode) !== -1 ? mode : 'Virement', String(reference || ''), utilisateur.email,
    ]);

    const feuille = getFeuilleDonnees(NOMS_FEUILLES.FACTURES);
    const encaisse = (Number(f.MontantEncaisse) || 0) + montant;
    const solde = encaisse >= (Number(f.Montant) || 0) - 0.5;
    majCellule(feuille, resultat, 'MontantEncaisse', encaisse);
    majCellule(feuille, resultat, 'StatutPaiement', solde ? STATUTS_PAIEMENT.PAYEE : STATUTS_PAIEMENT.PARTIELLE);
    if (solde) {
      majCellule(feuille, resultat, 'DatePaiement', quand);
      changerStatutAffaire(f.NumeroAffaire, STATUTS_AFFAIRE.PAYEE);
      const affaire = ligneVersObjet(trouverAffaire(f.NumeroAffaire).entetes, trouverAffaire(f.NumeroAffaire).ligne);
      alerterRoles([ROLES.DG, ROLES.DGA, ROLES.COMPTABILITE], 'Facture soldée ' + (f.NumeroDocument || numeroFacture),
        'La facture ' + (f.NumeroDocument || numeroFacture) + ' (' + affaire.Client + ' - ' + (affaire.Titre || f.NumeroAffaire) + ') est entièrement payée : '
        + formaterMontant(encaisse) + ' F encaissés.');
    }
    return { encaisse, reste: Math.max(0, (Number(f.Montant) || 0) - encaisse), statut: solde ? STATUTS_PAIEMENT.PAYEE : STATUTS_PAIEMENT.PARTIELLE };
  } finally {
    verrou.releaseLock();
  }
}

function paiementsDeLaFacture(numeroFacture) {
  return lireLignes(NOMS_FEUILLES.PAIEMENTS).filter((p) => p.NumeroFacture === numeroFacture);
}

/** Factures non soldées, les plus en retard d'abord. */
function facturesAEncaisser() {
  exigerRole(ROLES_LECTURE_FINANCES);
  const affaires = {};
  lireLignes(NOMS_FEUILLES.AFFAIRES).forEach((a) => { affaires[a.NumeroAffaire] = a; });
  return lireLignes(NOMS_FEUILLES.FACTURES)
    .filter((f) => f.StatutPaiement !== STATUTS_PAIEMENT.PAYEE)
    .map((f) => {
      const s = situationFacture(f);
      const a = affaires[f.NumeroAffaire] || {};
      return {
        numero: f.NumeroFacture, document: f.NumeroDocument, affaire: f.NumeroAffaire, client: a.Client || '',
        titre: a.Titre || a.TypeIntervention || '', montant: Number(f.Montant) || 0, reste: s.reste,
        statut: f.StatutPaiement, echeance: s.echeance, joursDeRetard: s.joursDeRetard,
      };
    })
    .sort((x, y) => y.joursDeRetard - x.joursDeRetard || (x.echeance || 0) - (y.echeance || 0));
}

/** Déclencheur quotidien : mail des factures en retard à la comptabilité, au DG et au DGA. */
function verifierFacturesEnRetard() {
  const affaires = {};
  lireLignes(NOMS_FEUILLES.AFFAIRES).forEach((a) => { affaires[a.NumeroAffaire] = a; });
  const enRetard = lireLignes(NOMS_FEUILLES.FACTURES)
    .filter((f) => f.StatutPaiement !== STATUTS_PAIEMENT.PAYEE)
    .map((f) => Object.assign({ f, a: affaires[f.NumeroAffaire] || {} }, situationFacture(f)))
    .filter((x) => x.joursDeRetard > 0)
    .sort((x, y) => y.joursDeRetard - x.joursDeRetard);
  if (enRetard.length === 0) {
    return;
  }
  const total = enRetard.reduce((s, x) => s + x.reste, 0);
  const lignes = enRetard.map((x) => '- ' + (x.f.NumeroDocument || x.f.NumeroFacture) + ' · ' + x.a.Client + ' · ' + (x.a.Titre || x.f.NumeroAffaire)
    + ' : reste ' + formaterMontant(x.reste) + ' F, en retard de ' + x.joursDeRetard + ' jour' + (x.joursDeRetard > 1 ? 's' : '')
    + (x.f.DateReception instanceof Date ? '' : ' (dépôt chez le client non saisi)'));
  alerterRoles([ROLES.COMPTABILITE, ROLES.DG, ROLES.DGA],
    enRetard.length + ' facture' + (enRetard.length > 1 ? 's' : '') + ' en retard (' + formaterMontant(total) + ' F)',
    'Factures à relancer ce matin :\n\n' + lignes.join('\n') + '\n\nTotal à encaisser en retard : ' + formaterMontant(total) + ' F.');
}

/** À lancer une fois : alerte des factures en retard chaque jour à 8 h. */
function installerDeclencheurFactures() {
  const dejaInstalle = ScriptApp.getProjectTriggers()
    .some((declencheur) => declencheur.getHandlerFunction() === 'verifierFacturesEnRetard');
  if (dejaInstalle) {
    Logger.log('Déclencheur déjà installé.');
    return;
  }
  ScriptApp.newTrigger('verifierFacturesEnRetard').timeBased().everyDays(1).atHour(8).create();
  Logger.log('Déclencheur installé : factures en retard chaque jour à 8 h.');
}

function htmlFactureClient(numeroFacture) {
  const resultat = trouverFacture(numeroFacture);
  const f = ligneVersObjet(resultat.entetes, resultat.ligne);
  const ra = trouverAffaire(f.NumeroAffaire);
  const affaire = ligneVersObjet(ra.entetes, ra.ligne);
  const lignes = lireLignes(NOMS_FEUILLES.LIGNES_DEVIS).filter((l) => l.NumeroDevis === f.NumeroDevis);
  const lignesFacture = lignes.length ? lignes
    : [{ NumeroLigne: 1, Designation: affaire.Titre || affaire.TypeIntervention, Quantite: 1, PrixUnitaire: f.Montant }];
  const total = Number(f.Montant) || totalLignes(lignesFacture);
  let proforma = '';
  if (f.NumeroDevis) {
    const d = trouverDevis(f.NumeroDevis);
    proforma = d.ligne[d.entetes.indexOf('NumeroDocument')] || '';
  }
  const references = [
    proforma ? 'Proforma N° ' + echapperHtml(proforma) : '',
    f.BonCommande ? 'Bon de commande N° ' + echapperHtml(f.BonCommande) : '',
  ].filter(Boolean).join(' · ');
  const delai = Number(f.DelaiPaiementJours) || DELAI_PAIEMENT_JOURS_DEFAUT;

  const contenu = blocObjetClient(affaire)
    + (references ? '<p style="margin:0 0 8px">Réf. : ' + references + '</p>' : '')
    + tableauLignesClient(lignesFacture)
    + arreteeALaSomme('facture', total)
    + '<p style="margin:6px 0 0">Paiement à ' + delai + ' jours à réception, par virement sur l\'un des comptes indiqués en pied de page.</p>'
    + '<table style="width:100%;margin-top:18px"><tr><td></td><td style="width:200px;text-align:center"><img src="' + IMAGES_ENTETE.signature + '" style="width:170px"></td></tr></table>';
  return cadreDocument('FACTURE', f.NumeroDocument || numeroFacture, contenu, f.DateEmission);
}

function pdfFactureBlob(numeroFacture) {
  const resultat = trouverFacture(numeroFacture);
  const numero = resultat.ligne[resultat.entetes.indexOf('NumeroDocument')] || numeroFacture;
  return Utilities.newBlob(htmlFactureClient(numeroFacture), 'text/html', 'facture.html')
    .getAs('application/pdf').setName('Facture ' + String(numero).replace(/[\/\s]+/g, '-') + '.pdf');
}

/** Crée le PDF de la facture dans Drive et renvoie son URL. */
function pdfFacture(numeroFacture) {
  exigerRole(ROLES_FACTURATION);
  return obtenirOuCreerDossier(NOM_DOSSIER_DOCUMENTS).createFile(pdfFactureBlob(numeroFacture)).getUrl();
}

/** Envoie la facture en PDF au contact du client (DG ou DGA) et renvoie les adresses. */
function envoyerFacture(numeroFacture) {
  const utilisateur = exigerRole([ROLES.DG, ROLES.DGA]);
  const resultat = trouverFacture(numeroFacture);
  const f = ligneVersObjet(resultat.entetes, resultat.ligne);
  const affaire = ligneVersObjet(trouverAffaire(f.NumeroAffaire).entetes, trouverAffaire(f.NumeroAffaire).ligne);
  const a = contactClient(affaire.Client);
  if (!a) {
    throw new Error("Aucune adresse mail pour " + affaire.Client + " : renseigne ContactEmail dans la feuille Clients.");
  }
  MailApp.sendEmail({
    to: a, cc: utilisateur.email, name: 'Symbiose',
    subject: 'Facture ' + (f.NumeroDocument || numeroFacture) + ' - ' + (affaire.Titre || affaire.Client) + (affaire.Site ? ' (' + affaire.Site + ')' : ''),
    htmlBody: '<p>Bonjour,</p><p>Veuillez trouver ci-joint notre facture relative à l\'intervention citée en objet.</p><p>Cordialement,<br>Symbiose</p>',
    attachments: [pdfFactureBlob(numeroFacture)],
  });
  return a;
}
