/**
 * Documents envoyés aux clients, sur le papier en-tête officiel (images dans 15_EnteteImages) :
 * proforma en PDF (pas de TVA : Symbiose n'en facture pas), numérotée IGS-<code client>/ 040/ 26.
 * Le client ne voit que N°, désignation, quantité, PU, montant et total ; jamais les coûts,
 * la marge, la commission ni l'impôt.
 */

const NOM_DOSSIER_DOCUMENTS = 'Maison Symbiose - Documents';

function obtenirOuCreerDossier(nom) {
  const dossiers = DriveApp.getFoldersByName(nom);
  return dossiers.hasNext() ? dossiers.next() : DriveApp.createFolder(nom);
}

// La dernière proforma faite à la main en 2026 était la n° 039 ; on enchaîne.
const PREMIER_NUMERO_PROFORMA = 40;
const METIERS_SYMBIOSE = 'Câblage réseau – fibre optique – Sécurité électronique – Climatisation et froid – Fourniture d\'équipements informatiques, techniques et de bureautique – Communication d\'entreprise – Prestations diverses';
const MENTIONS_LEGALES = 'INTERNATIONAL GROUPE SYMBIOSE SARL · Capital : 1 000 000 Francs CFA · Siège : Yopougon Selmer COOPEC · RCCM : CI-ABJ-2020-B-07143 · CC N° : 2023082 C<br>'
  + 'AFG BANK - IBAN - CI93 CI260 01201 01345598000123 · WITTI FINANCE - IBAN - CI93 CI201 01001 108296537784 53<br>'
  + 'Contacts : (+225) 07 08 75 99 68 / 01 01 83 63 78 · E-mail : infos@symbioz.cc · Site web : www.symbioz.cc';

function echapperHtml(t) {
  return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Habille un contenu avec le papier en-tête officiel (bandeau métiers, encadré fiscal, pied légal). */
function cadreDocument(titre, numero, contenu, dateDocument) {
  const date = Utilities.formatDate(dateDocument instanceof Date ? dateDocument : new Date(), 'Africa/Abidjan', 'dd/MM/yyyy');
  return '<!doctype html><html><head><meta charset="utf-8"><style>table{font-size:inherit;color:inherit}</style></head><body style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#1F2937">'
    + '<table style="width:100%;border-collapse:collapse;background:#0E7A93" cellpadding="0"><tr>'
    + '<td style="width:190px;padding:8px 10px;background:#0E7A93"><div style="background:#fff;border-radius:6px;padding:4px"><img src="' + IMAGES_ENTETE.logo + '" style="width:170px"></div></td>'
    + '<td style="color:#fff;font-weight:bold;font-size:10px;padding:8px 12px">' + METIERS_SYMBIOSE + '</td></tr></table>'
    + '<img src="' + IMAGES_ENTETE.bandeau + '" style="width:100%;height:14px">'
    + '<div style="padding:14px 28px">'
    + '<table style="width:100%"><tr><td style="vertical-align:top"><div style="border:1.5px solid #1E6FA8;border-radius:6px;padding:6px 10px;display:inline-block">CC : 2023082 C<br>Régime d\'imposition : RME<br>Centre des Impôts : Yopougon 5</div></td>'
    + '<td style="text-align:right;vertical-align:top"><b style="font-size:16px;color:#0E5C8C">' + echapperHtml(titre) + '</b>'
    + (numero ? '<br><b>N° ' + echapperHtml(numero) + '</b>' : '') + '<br>Abidjan, le ' + date + '</td></tr></table>'
    + contenu
    + '</div>'
    + '<table style="width:100%;margin-top:24px;border-collapse:collapse" cellpadding="0" cellspacing="0"><tr>'
    + '<td style="width:360px;vertical-align:bottom"><img src="' + IMAGES_ENTETE.pied + '" style="width:360px;display:block"></td>'
    + '<td style="vertical-align:bottom"><div style="height:44px;background:#D1D3D4"></div></td></tr></table>'
    + '<div style="background:#D1D3D4;padding:6px 14px 10px;font-size:8.5px;text-align:center;font-weight:bold;color:#111827">' + MENTIONS_LEGALES + '</div>'
    + '</body></html>';
}

/** Numéro officiel de la proforma (forme IGS-AGB/ 039/ 26), attribué une fois puis conservé. */
function numeroDocumentProforma(numeroDevis, client) {
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.DEVIS);
  const resultat = trouverDevis(numeroDevis);
  const existant = resultat.ligne[resultat.entetes.indexOf('NumeroDocument')];
  if (existant) return existant;

  const proprietes = PropertiesService.getScriptProperties();
  const verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  try {
    const annee = Utilities.formatDate(new Date(), 'Africa/Abidjan', 'yy');
    const cleAnnee = 'NUMERO_PROFORMA_' + annee;
    const suivant = Number(proprietes.getProperty(cleAnnee) || proprietes.getProperty('PROCHAIN_NUMERO_PROFORMA') || PREMIER_NUMERO_PROFORMA);
    proprietes.setProperty(cleAnnee, String(suivant + 1));
    const ligneClient = lireLignes(NOMS_FEUILLES.CLIENTS).filter((c) => c.NomClient === client)[0];
    const code = (ligneClient && ligneClient.CodeDocument) || String(client).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
    const numero = 'IGS-' + code + '/ ' + String(suivant).padStart(3, '0') + '/ ' + annee;
    majCellule(feuille, resultat, 'NumeroDocument', numero);
    return numero;
  } finally {
    verrou.releaseLock();
  }
}

function formaterMontant(n) {
  return Math.round(Number(n)).toLocaleString('fr-FR').replace(/ | /g, ' ');
}

function totalLignes(lignes) {
  return lignes.reduce((s, l) => s + Number(l.Quantite) * Number(l.PrixUnitaire), 0);
}

/** Tableau N° / Désignation / Qté / P.U. / Montant + TOTAL, commun à la proforma et à la facture. */
function tableauLignesClient(lignes) {
  const fmt = formaterMontant;
  const total = totalLignes(lignes);
  const cellule = 'border:1px solid #9CA3AF;padding:6px';
  return ''
    + '<table style="width:100%;border-collapse:collapse"><tr style="background:#A9CDEB;font-weight:bold">'
    + '<td style="' + cellule + ';width:28px">N°</td><td style="' + cellule + ';text-align:center">Désignation</td><td style="' + cellule + ';text-align:center;width:40px">Qté</td>'
    + '<td style="' + cellule + ';text-align:right;width:90px">P.U. (XOF)</td><td style="' + cellule + ';text-align:right;width:100px">Montant (XOF)</td></tr>'
    + lignes.map((l) => '<tr><td style="' + cellule + '">' + l.NumeroLigne + '</td><td style="' + cellule + '">' + echapperHtml(l.Designation) + '</td>'
      + '<td style="' + cellule + ';text-align:center">' + l.Quantite + '</td><td style="' + cellule + ';text-align:right">' + fmt(l.PrixUnitaire) + '</td>'
      + '<td style="' + cellule + ';text-align:right">' + fmt(Number(l.Quantite) * Number(l.PrixUnitaire)) + '</td></tr>').join('')
    + '<tr style="font-weight:bold;font-size:12px"><td colspan="4" style="' + cellule + ';border-top:1.5px solid #1F2937;text-align:center">TOTAL</td><td style="' + cellule + ';border-top:1.5px solid #1F2937;text-align:right">' + fmt(total) + '</td></tr></table>';
}

function arreteeALaSomme(nature, total) {
  return '<p style="margin-top:14px">Arrêtée la présente ' + nature + ' à la somme de <b>' + nombreEnLettres(total) + ' (' + formaterMontant(total) + ') francs CFA</b>.</p>';
}

/** Encadré OBJET + client/site en tête de la proforma et de la facture. */
function blocObjetClient(affaire) {
  return '<table style="width:100%;margin:14px 0"><tr>'
    + '<td style="vertical-align:top;width:55%"><b style="color:#0E5C8C;text-decoration:underline;font-size:10px">OBJET</b><br><b>' + echapperHtml(String(affaire.Titre || affaire.TypeIntervention).toUpperCase()) + '</b></td>'
    + '<td style="border:1.5px solid #1F2937;text-align:center;padding:8px"><b style="font-size:13px">' + echapperHtml(String(affaire.Client).toUpperCase()) + '</b>' + (affaire.Site ? '<br>' + echapperHtml(affaire.Site) : '') + '</td></tr></table>';
}

function htmlProformaClient(numeroDevis) {
  const resultat = trouverDevis(numeroDevis);
  const devis = ligneVersObjet(resultat.entetes, resultat.ligne);
  const ra = trouverAffaire(devis.NumeroAffaire);
  const affaire = ligneVersObjet(ra.entetes, ra.ligne);
  const lignes = lireLignes(NOMS_FEUILLES.LIGNES_DEVIS).filter((l) => l.NumeroDevis === numeroDevis);
  const total = totalLignes(lignes);

  const contenu = blocObjetClient(affaire)
    + tableauLignesClient(lignes)
    + arreteeALaSomme('facture proforma', total)
    + '<table style="width:100%;margin-top:18px"><tr><td></td><td style="width:200px;text-align:center"><img src="' + IMAGES_ENTETE.signature + '" style="width:170px"></td></tr></table>';

  return cadreDocument('FACTURE PROFORMA', numeroDocumentProforma(numeroDevis, affaire.Client), contenu);
}

function nomFichierProforma(numeroDevis) {
  const resultat = trouverDevis(numeroDevis);
  const numero = resultat.ligne[resultat.entetes.indexOf('NumeroDocument')] || numeroDevis;
  return 'Proforma ' + String(numero).replace(/[\/\s]+/g, '-') + '.pdf';
}

/** Crée le PDF de la proforma dans Drive et renvoie {url, id}. */
function pdfProforma(numeroDevis) {
  exigerRole([ROLES.DG, ROLES.DGA]);
  const html = htmlProformaClient(numeroDevis);
  const blob = Utilities.newBlob(html, 'text/html', 'proforma.html')
    .getAs('application/pdf').setName(nomFichierProforma(numeroDevis));
  const fichier = obtenirOuCreerDossier(NOM_DOSSIER_DOCUMENTS).createFile(blob);
  return { url: fichier.getUrl(), id: fichier.getId() };
}

/** Envoie la proforma en PDF au contact du client (ou à destinataires) et renvoie l'adresse utilisée. */
function envoyerProforma(numeroDevis, destinataires) {
  const utilisateur = exigerRole([ROLES.DG, ROLES.DGA]);
  const devis = ligneVersObjet(trouverDevis(numeroDevis).entetes, trouverDevis(numeroDevis).ligne);
  const affaire = ligneVersObjet(trouverAffaire(devis.NumeroAffaire).entetes, trouverAffaire(devis.NumeroAffaire).ligne);
  const a = destinataires || contactClient(affaire.Client);
  if (!a) {
    throw new Error("Aucune adresse mail pour " + affaire.Client + " : renseigne ContactEmail dans la feuille Clients.");
  }
  const html = htmlProformaClient(numeroDevis);
  const pdf = Utilities.newBlob(html, 'text/html', 'proforma.html').getAs('application/pdf')
    .setName(nomFichierProforma(numeroDevis));
  MailApp.sendEmail({
    to: a, cc: utilisateur.email, name: 'Symbiose',
    subject: 'Facture proforma ' + numeroDocumentProforma(numeroDevis, affaire.Client) + ' - ' + (affaire.Titre || affaire.Client),
    htmlBody: '<p>Bonjour,</p><p>Veuillez trouver ci-joint notre proforma.</p><p>Cordialement,<br>Symbiose</p>',
    attachments: [pdf],
  });
  return a;
}

/** Écrit un montant entier en toutes lettres, en français (ex. 2000000 -> "deux millions"). */
function nombreEnLettres(n) {
  n = Math.round(Number(n));
  if (n === 0) return 'zéro';
  const unites = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
    'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const dizaines = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

  const moinsDeCent = (x) => {
    if (x < 20) return unites[x];
    const d = Math.floor(x / 10);
    let u = x % 10;
    if (d === 7 || d === 9) u += 10;
    let mot = dizaines[d];
    if (u === 0) return d === 8 ? mot + 's' : mot;
    if ((u === 1 || u === 11) && d !== 8 && d !== 9) return mot + ' et ' + unites[u];
    return mot + '-' + unites[u];
  };
  const moinsDeMille = (x) => {
    const c = Math.floor(x / 100);
    const r = x % 100;
    let mot = c === 0 ? '' : (c === 1 ? 'cent' : unites[c] + ' cent' + (r === 0 ? 's' : ''));
    if (r) mot += (mot ? ' ' : '') + moinsDeCent(r);
    return mot;
  };

  const parties = [];
  const milliards = Math.floor(n / 1e9);
  const millions = Math.floor((n % 1e9) / 1e6);
  const milliers = Math.floor((n % 1e6) / 1e3);
  const reste = n % 1e3;
  if (milliards) parties.push(moinsDeMille(milliards) + ' milliard' + (milliards > 1 ? 's' : ''));
  if (millions) parties.push(moinsDeMille(millions) + ' million' + (millions > 1 ? 's' : ''));
  if (milliers) parties.push(milliers === 1 ? 'mille' : moinsDeMille(milliers).replace(/cents$/, 'cent') + ' mille');
  if (reste) parties.push(moinsDeMille(reste));
  return parties.join(' ');
}
