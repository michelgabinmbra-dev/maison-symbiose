/**
 * Documents envoyés aux clients : proforma en PDF (pas de TVA : Symbiose n'en facture pas).
 * Le client ne voit que N°, désignation, quantité, PU, montant et total ; jamais les coûts,
 * la marge, la commission ni l'impôt.
 */

const NOM_DOSSIER_DOCUMENTS = 'Maison Symbiose - Documents';

function obtenirOuCreerDossier(nom) {
  const dossiers = DriveApp.getFoldersByName(nom);
  return dossiers.hasNext() ? dossiers.next() : DriveApp.createFolder(nom);
}

function htmlProformaClient(numeroDevis) {
  const resultat = trouverDevis(numeroDevis);
  const devis = ligneVersObjet(resultat.entetes, resultat.ligne);
  const affaire = ligneVersObjet(trouverAffaire(devis.NumeroAffaire).entetes, trouverAffaire(devis.NumeroAffaire).ligne);
  const lignes = lireLignes(NOMS_FEUILLES.LIGNES_DEVIS).filter((l) => l.NumeroDevis === numeroDevis);
  const fmt = (n) => Math.round(Number(n)).toLocaleString('fr-FR').replace(/ | /g, ' ');
  const echapper = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const total = lignes.reduce((s, l) => s + Number(l.Quantite) * Number(l.PrixUnitaire), 0);

  const rangees = lignes.map((l, i) => '<tr' + (i % 2 ? ' style="background:#F7F8FD"' : '') + '>'
    + '<td>' + l.NumeroLigne + '</td><td>' + echapper(l.Designation) + '</td>'
    + '<td style="text-align:right">' + l.Quantite + '</td>'
    + '<td style="text-align:right">' + fmt(l.PrixUnitaire) + '</td>'
    + '<td style="text-align:right"><b>' + fmt(Number(l.Quantite) * Number(l.PrixUnitaire)) + '</b></td></tr>').join('');

  return '<div style="font-family:Arial,sans-serif;font-size:12px;color:#0F1733">'
    + '<div style="height:6px;background:#2563EB"></div>'
    + '<table style="width:100%;margin-top:12px"><tr><td><b style="font-size:18px;color:#0B1442">Symbiose</b><br>International Groupe Symbiose</td>'
    + '<td style="text-align:right"><b style="font-size:16px;color:#2563EB">PROFORMA</b><br>N° ' + echapper(numeroDevis.replace('DEV', 'PRO'))
    + '<br>Abidjan, ' + Utilities.formatDate(new Date(), 'Africa/Abidjan', 'dd/MM/yyyy') + '</td></tr></table>'
    + '<table style="width:100%;margin:12px 0"><tr><td style="background:#F3F5FB;padding:8px;width:50%"><small>CLIENT</small><br><b>' + echapper(affaire.Client) + '</b><br>' + echapper(affaire.Site || '') + '</td>'
    + '<td style="background:#F3F5FB;padding:8px"><small>OBJET</small><br>' + echapper(affaire.Titre || affaire.TypeIntervention) + '</td></tr></table>'
    + '<table style="width:100%;border-collapse:collapse" cellpadding="6"><tr style="background:#0B1442;color:#fff"><th>N°</th><th style="text-align:left">DÉSIGNATION</th><th>QTÉ</th><th>P.U.</th><th>MONTANT</th></tr>'
    + rangees + '</table>'
    + '<p style="background:#1E3A8A;color:#fff;padding:10px;font-size:15px"><b>TOTAL GÉNÉRAL : ' + fmt(total) + ' F CFA</b></p>'
    + '<p>Arrêtée la présente proforma à la somme de <b>' + nombreEnLettres(total) + ' (' + fmt(total) + ') francs CFA</b>.</p>'
    + '<p style="margin-top:40px;text-align:right">Cachet et signature</p></div>';
}

/** Crée le PDF de la proforma dans Drive et renvoie {url, id}. */
function pdfProforma(numeroDevis) {
  exigerRole([ROLES.DG, ROLES.DGA]);
  const blob = Utilities.newBlob(htmlProformaClient(numeroDevis), 'text/html', 'proforma.html')
    .getAs('application/pdf').setName('Proforma ' + numeroDevis.replace('DEV', 'PRO') + '.pdf');
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
    .setName('Proforma ' + numeroDevis.replace('DEV', 'PRO') + '.pdf');
  MailApp.sendEmail({
    to: a, cc: utilisateur.email, name: 'Symbiose',
    subject: 'Proforma ' + numeroDevis.replace('DEV', 'PRO') + ' - ' + (affaire.Titre || affaire.Client),
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
