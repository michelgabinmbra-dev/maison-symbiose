/**
 * Rapports d'intervention : l'agent sur place remplit sur son téléphone le constat, la cause,
 * les éléments contrôlés (état + observation), les travaux faits, la recommandation et jusqu'à
 * 2 photos. Le PDF client suit le papier en-tête officiel (maquette 2b validée le 04/11/2026).
 */

const DOMAINES_RAPPORT = ['Climatisation', 'Électricité', 'Groupe électrogène', 'Sécurité électronique', 'Contrôle d\'accès', 'Réseau / fibre', 'Plomberie', 'Autre'];
const ETATS_CONTROLE = ['OK', 'À surveiller', 'HS'];
const NOM_DOSSIER_PHOTOS_RAPPORTS = 'Maison Symbiose - Photos rapports';
const PHOTOS_MAX_RAPPORT = 2;

/**
 * Crée un rapport sur une affaire. details : {domaine, localisation, constat, cause, travaux,
 * recommandation, controles: [{element, etat, observation}], photos: [base64 jpeg]}.
 */
function creerRapport(numeroAffaire, details) {
  const utilisateur = exigerRole(Object.values(ROLES));
  trouverAffaire(numeroAffaire);
  if (!details || !details.constat) {
    throw new Error('Le constat est obligatoire.');
  }
  const photos = (details.photos || []).slice(0, PHOTOS_MAX_RAPPORT);
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.RAPPORTS);
  const numero = genererNumero('RAP', feuille, 'NumeroRapport');
  const dossier = obtenirOuCreerDossier(NOM_DOSSIER_PHOTOS_RAPPORTS);
  const idsPhotos = photos.map((base64, i) => dossier.createFile(
    Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg', numero + '_' + (i + 1) + '.jpg')).getId());
  const controles = (details.controles || [])
    .filter((c) => c && c.element)
    .map((c) => ({ element: String(c.element), etat: ETATS_CONTROLE.indexOf(c.etat) !== -1 ? c.etat : 'OK', observation: String(c.observation || '') }));

  feuille.appendRow([
    numero, numeroAffaire, utilisateur.nom, new Date(), details.domaine || '', details.localisation || '',
    details.constat, details.cause || '', details.travaux || '', details.recommandation || '',
    JSON.stringify(controles), JSON.stringify(idsPhotos), utilisateur.email,
  ]);

  const affaire = trouverAffaire(numeroAffaire);
  if (!(Number(affaire.ligne[affaire.entetes.indexOf('Avancement')]) > 0)) {
    mettreAJourSuivi(numeroAffaire, { avancement: 20 });
  }
  return numero;
}

function rapportsDeLAffaire(numeroAffaire) {
  return lireLignes(NOMS_FEUILLES.RAPPORTS)
    .filter((r) => r.NumeroAffaire === numeroAffaire)
    .map((r) => ({
      numero: r.NumeroRapport, date: r.Date, technicien: r.Technicien, domaine: r.Domaine,
      constat: r.Constat, nombrePhotos: JSON.parse(r.Photos || '[]').length,
    }));
}

function trouverRapport(numeroRapport) {
  const resultat = trouverLigneParValeur(getFeuilleDonnees(NOMS_FEUILLES.RAPPORTS), 'NumeroRapport', numeroRapport);
  if (!resultat) {
    throw new Error('Rapport introuvable : ' + numeroRapport);
  }
  return ligneVersObjet(resultat.entetes, resultat.ligne);
}

function htmlRapportClient(numeroRapport) {
  const r = trouverRapport(numeroRapport);
  const ra = trouverAffaire(r.NumeroAffaire);
  const affaire = ligneVersObjet(ra.entetes, ra.ligne);
  const e = echapperHtml;
  const couleurs = { 'OK': '#047857', 'À surveiller': '#B45309', 'HS': '#B91C1C' };
  const controles = JSON.parse(r.Controles || '[]');
  const photos = JSON.parse(r.Photos || '[]').map((id) => {
    const blob = DriveApp.getFileById(id).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  });
  const cellule = 'border:1px solid #9CA3AF;padding:5px 6px';
  const rubrique = (titre, texte) => texte
    ? '<p style="margin:10px 0 2px"><b style="font-size:10px;color:#0E5C8C;letter-spacing:.06em">' + titre + '</b><br>' + e(texte).replace(/\n/g, '<br>') + '</p>'
    : '';

  const contenu = '<p style="margin:12px 0 4px"><b>' + e(r.Domaine || affaire.TypeIntervention) + ' · ' + e(affaire.TypeIntervention) + '</b> · Technicien : ' + e(r.Technicien)
    + ' · Intervention du ' + Utilities.formatDate(new Date(r.Date), 'Africa/Abidjan', 'dd/MM/yyyy') + '</p>'
    + '<table style="width:100%;border:1.5px solid #1F2937;margin:6px 0"><tr><td style="padding:6px 8px"><b style="font-size:12px">' + e(String(affaire.Client).toUpperCase()) + '</b>'
    + (affaire.Site ? ' · ' + e(affaire.Site) : '') + '</td><td style="padding:6px 8px;text-align:right;color:#4B5563">' + e(r.Localisation) + '</td></tr></table>'
    + '<p style="margin:8px 0 0"><b style="font-size:10px;color:#0E5C8C;letter-spacing:.06em">OBJET</b><br>' + e(affaire.Titre || '') + '</p>'
    + rubrique('CONSTAT', r.Constat)
    + rubrique('CAUSE PROBABLE', r.Cause)
    + (controles.length
      ? '<table style="width:100%;border-collapse:collapse;margin-top:10px"><tr style="background:#A9CDEB;font-weight:bold"><td style="' + cellule + '">Élément contrôlé</td><td style="' + cellule + ';text-align:center;width:90px">État</td><td style="' + cellule + '">Observations</td></tr>'
        + controles.map((c) => '<tr><td style="' + cellule + '">' + e(c.element) + '</td><td style="' + cellule + ';text-align:center;font-weight:bold;color:' + (couleurs[c.etat] || '#1F2937') + '">' + e(c.etat) + '</td><td style="' + cellule + '">' + e(c.observation) + '</td></tr>').join('')
        + '</table>'
      : '')
    + rubrique('TRAVAUX RÉALISÉS', r.TravauxRealises)
    + (photos.length
      ? '<table style="width:100%;margin-top:10px"><tr>' + photos.map((src, i) => '<td style="width:50%;padding:3px;text-align:center;vertical-align:middle"><img src="' + src + '" style="max-width:100%;max-height:240px"></td>').join('') + '</tr></table>'
      : '')
    + rubrique('RECOMMANDATION', r.Recommandation)
    + '<table style="width:100%;margin-top:14px"><tr><td></td><td style="width:200px;text-align:center"><img src="' + IMAGES_ENTETE.signature + '" style="width:150px"></td></tr></table>';

  return cadreDocument('RAPPORT D\'INTERVENTION', numeroRapport, contenu);
}

function pdfRapportBlob(numeroRapport) {
  return Utilities.newBlob(htmlRapportClient(numeroRapport), 'text/html', 'rapport.html')
    .getAs('application/pdf').setName('Rapport ' + numeroRapport + '.pdf');
}

/** Crée le PDF du rapport dans Drive et renvoie son URL. */
function pdfRapport(numeroRapport) {
  exigerRole(Object.values(ROLES));
  return obtenirOuCreerDossier(NOM_DOSSIER_DOCUMENTS).createFile(pdfRapportBlob(numeroRapport)).getUrl();
}

/** Envoie le rapport en PDF aux contacts du client (DG ou DGA) et renvoie les adresses. */
function envoyerRapport(numeroRapport) {
  const utilisateur = exigerRole([ROLES.DG, ROLES.DGA]);
  const r = trouverRapport(numeroRapport);
  const ra = trouverAffaire(r.NumeroAffaire);
  const affaire = ligneVersObjet(ra.entetes, ra.ligne);
  const a = contactClient(affaire.Client);
  if (!a) {
    throw new Error("Aucune adresse mail pour " + affaire.Client + " : renseigne ContactEmail dans la feuille Clients.");
  }
  MailApp.sendEmail({
    to: a, cc: utilisateur.email, name: 'Symbiose',
    subject: "Rapport d'intervention " + numeroRapport + ' - ' + (affaire.Titre || affaire.Client) + (affaire.Site ? ' (' + affaire.Site + ')' : ''),
    htmlBody: "<p>Bonjour,</p><p>Veuillez trouver ci-joint le rapport de notre intervention.</p><p>Cordialement,<br>Symbiose</p>",
    attachments: [pdfRapportBlob(numeroRapport)],
  });
  return a;
}
