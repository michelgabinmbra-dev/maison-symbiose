/**
 * Point de situation client "en 5 secondes" (ex. la demande d'AFG) : à partir des affaires du
 * client, quatre rubriques : problèmes signalés, actions réalisées et avancement, difficultés en
 * attente, actions restantes et délais. Exportable en PDF ou envoyé par mail.
 */

const STATUTS_CLOS = [STATUTS_AFFAIRE.PAYEE, STATUTS_AFFAIRE.ABANDONNEE];

function pointDeSituation(client) {
  exigerRole([ROLES.DG, ROLES.DGA, ROLES.COMPTABILITE]);
  if (!client) {
    throw new Error('Le client est obligatoire.');
  }
  const affaires = lireLignes(NOMS_FEUILLES.AFFAIRES)
    .filter((a) => a.Client === client && a.Statut !== STATUTS_AFFAIRE.ABANDONNEE);

  const resume = (a) => ({
    numero: a.NumeroAffaire,
    titre: a.Titre || a.TypeIntervention,
    site: a.Site || '',
    avancement: Number(a.Avancement) || 0,
    statut: a.Statut,
    blocage: a.Blocage || '',
    prochaineAction: a.ProchaineAction || '',
    delaiPrevu: a.DelaiPrevu instanceof Date ? a.DelaiPrevu : null,
  });
  const tous = affaires.map(resume);
  const ouverts = affaires.filter((a) => STATUTS_CLOS.indexOf(a.Statut) === -1).map(resume);

  return {
    client,
    date: new Date(),
    problemesSignales: tous,
    actionsRealisees: tous.filter((a) => a.avancement > 0 || a.statut !== STATUTS_AFFAIRE.NOUVELLE_DEMANDE),
    difficultes: ouverts.filter((a) => a.blocage),
    actionsRestantes: ouverts
      .filter((a) => a.prochaineAction || a.avancement < 100)
      .sort((a, b) => (a.delaiPrevu || new Date(8.64e15)) - (b.delaiPrevu || new Date(8.64e15))),
  };
}

/** HTML du point de situation, utilisé pour le mail et le PDF. */
function htmlPointDeSituation(point) {
  const date = (d) => (d ? Utilities.formatDate(d, 'Africa/Abidjan', 'dd/MM/yyyy') : 'à définir');
  const echapper = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lieu = (a) => echapper(a.titre) + (a.site ? ' (' + echapper(a.site) + ')' : '');
  const liste = (elements, rendu) => elements.length
    ? '<ul>' + elements.map((a) => '<li>' + rendu(a) + '</li>').join('') + '</ul>'
    : '<p><i>Aucun.</i></p>';

  return '<div style="font-family:Arial,sans-serif;font-size:13px;color:#0F1733">'
    + '<h2 style="color:#0B1442">Point de situation ' + echapper(point.client) + ' au ' + date(point.date) + '</h2>'
    + '<h3>1. Problèmes signalés à ce jour (' + point.problemesSignales.length + ')</h3>'
    + liste(point.problemesSignales, lieu)
    + '<h3>2. Actions réalisées et niveau d\'avancement</h3>'
    + liste(point.actionsRealisees, (a) => lieu(a) + ' : <b>' + a.avancement + ' %</b> (' + echapper(a.statut) + ')')
    + '<h3>3. Difficultés en attente de résolution</h3>'
    + liste(point.difficultes, (a) => lieu(a) + ' : ' + echapper(a.blocage))
    + '<h3>4. Actions restantes et délais prévisionnels</h3>'
    + liste(point.actionsRestantes, (a) => lieu(a) + ' : ' + echapper(a.prochaineAction || 'à finaliser') + ' (prévu le ' + date(a.delaiPrevu) + ')')
    + '<p>Cordialement,<br>Symbiose</p></div>';
}

/** Crée le PDF du point de situation dans Drive et renvoie son URL. */
function pdfPointDeSituation(client) {
  const point = pointDeSituation(client);
  const blob = Utilities.newBlob(htmlPointDeSituation(point), 'text/html', 'point.html')
    .getAs('application/pdf')
    .setName('Point de situation ' + client + ' ' + Utilities.formatDate(new Date(), 'Africa/Abidjan', 'yyyy-MM-dd') + '.pdf');
  return obtenirOuCreerDossier(NOM_DOSSIER_DOCUMENTS).createFile(blob).getUrl();
}

/** Envoie le point de situation par mail (avec le PDF joint) au contact du client ou à destinataires. */
function envoyerPointDeSituation(client, destinataires) {
  const utilisateur = exigerRole([ROLES.DG, ROLES.DGA]);
  const point = pointDeSituation(client);
  const a = destinataires || contactClient(client);
  if (!a) {
    throw new Error("Aucune adresse mail pour " + client + " : renseigne ContactEmail dans la feuille Clients.");
  }
  const html = htmlPointDeSituation(point);
  const pdf = Utilities.newBlob(html, 'text/html', 'point.html').getAs('application/pdf')
    .setName('Point de situation ' + client + '.pdf');
  MailApp.sendEmail({
    to: a,
    cc: utilisateur.email,
    subject: 'Point de situation des interventions ' + client,
    htmlBody: html,
    attachments: [pdf],
    name: 'Symbiose',
  });
  return a;
}

function contactClient(client) {
  const ligne = lireLignes(NOMS_FEUILLES.CLIENTS).filter((c) => c.NomClient === client)[0];
  return ligne ? ligne.ContactEmail : '';
}
