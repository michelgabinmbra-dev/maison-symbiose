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
    .map((c) => ({ section: String(c.section || ''), element: String(c.element), etat: ETATS_CONTROLE.indexOf(c.etat) !== -1 ? c.etat : 'OK', observation: String(c.observation || '') }));

  feuille.appendRow([
    numero, numeroAffaire, utilisateur.nom, new Date(), details.domaine || '', details.localisation || '',
    details.constat, details.cause || '', details.travaux || '', details.recommandation || '',
    JSON.stringify(controles), JSON.stringify(idsPhotos), utilisateur.email,
  ]);
  const ligneRapport = trouverLigneParValeur(feuille, 'NumeroRapport', numero);
  // Compartiments (observations, à faire au prochain passage, photos) et points du site cochés comme faits.
  enregistrerSuiviRapport(numero, details.sections, details.faits);
  if (details.piecesHorsContrat) majCellule(feuille, ligneRapport, 'PiecesHorsContrat', String(details.piecesHorsContrat).trim());
  if (details.signature) {
    // Visa du client (agence) signé sur le téléphone du technicien.
    const idSignature = dossier.createFile(Utilities.newBlob(Utilities.base64Decode(details.signature), 'image/png', numero + '_visa_client.png')).getId();
    majCellule(feuille, ligneRapport, 'SignatureClient', idSignature);
    majCellule(feuille, ligneRapport, 'SignataireClient', String(details.signataire || '').trim());
  }

  const affaire = trouverAffaire(numeroAffaire);
  if (!(Number(affaire.ligne[affaire.entetes.indexOf('Avancement')]) > 0)) {
    mettreAJourSuivi(numeroAffaire, { avancement: 20 });
  }
  signalerRapportARelire(numero, numeroAffaire, utilisateur.nom);
  return numero;
}

function rapportsDeLAffaire(numeroAffaire) {
  return lireLignes(NOMS_FEUILLES.RAPPORTS)
    .filter((r) => r.NumeroAffaire === numeroAffaire)
    .map((r) => ({
      numero: r.NumeroRapport, date: r.Date, technicien: r.Technicien, domaine: r.Domaine,
      constat: r.Constat, nombrePhotos: JSON.parse(r.Photos || '[]').length,
      cause: r.Cause || '', travaux: r.TravauxRealises || '', recommandation: r.Recommandation || '', localisation: r.Localisation || '',
      pieces: r.PiecesHorsContrat || '', signataire: r.SignataireClient || '', signe: !!r.SignatureClient,
      statut: r.Statut || '', envoyeLe: r.EnvoyeLe instanceof Date ? r.EnvoyeLe.toISOString() : (r.EnvoyeLe || ''),
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
  const sectionsControles = controles.map((c) => c.section || '').filter((x, i, t) => t.indexOf(x) === i);
  const mesures = JSON.parse(r.Mesures || '{}');
  const photos = JSON.parse(r.Photos || '[]').map((id) => {
    const blob = DriveApp.getFileById(id).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  });
  const suivi = suiviDuRapport(r);
  const imageDrive = (id) => { try { const b = DriveApp.getFileById(id).getBlob(); return 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()); } catch (x) { return ''; } };
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
    + tableauReleves(mesures)
    + (controles.length
      ? sectionsControles.map((section) => (section ? '<p style="margin:12px 0 0"><b style="font-size:11px;color:#0E5C8C">' + e(section.toUpperCase()) + '</b></p>' : '')
        + '<table style="width:100%;border-collapse:collapse;margin-top:' + (section ? '3' : '10') + 'px"><tr style="background:#A9CDEB;font-weight:bold"><td style="' + cellule + '">Élément contrôlé</td><td style="' + cellule + ';text-align:center;width:90px">État</td><td style="' + cellule + '">Observations</td></tr>'
        + controles.filter((c) => (c.section || '') === section).map((c) => '<tr><td style="' + cellule + '">' + e(c.element) + '</td><td style="' + cellule + ';text-align:center;font-weight:bold;color:' + (couleurs[c.etat] || '#1F2937') + '">' + e(c.etat) + '</td><td style="' + cellule + '">' + e(c.observation) + '</td></tr>').join('')
        + '</table>').join('')
      : '')
    + suivi.sections.map((sec) => '<div style="margin-top:10px;border-left:3px solid #0E5C8C;padding-left:8px"><b style="font-size:11px;color:#0E5C8C">' + e(String(sec.section).toUpperCase()) + '</b>'
      + (sec.observation ? '<br><b style="font-size:10px;color:#4B5563">Observations :</b> ' + e(sec.observation).replace(/\n/g, '<br>') : '')
      + (sec.aFaire ? '<br><b style="font-size:10px;color:#B45309">À prévoir au prochain passage :</b> ' + e(sec.aFaire).replace(/\n/g, '<br>') : '')
      + ((sec.photos || []).length ? '<table style="width:100%;margin-top:4px"><tr>' + sec.photos.map(imageDrive).filter(Boolean).map((src) => '<td style="width:50%;padding:3px;text-align:center"><img src="' + src + '" style="max-width:100%;max-height:200px"></td>').join('') + '</tr></table>' : '')
      + '</div>').join('')
    + rubrique('TRAVAUX RÉALISÉS', r.TravauxRealises)
    + (photos.length
      ? '<table style="width:100%;margin-top:10px"><tr>' + photos.map((src, i) => '<td style="width:50%;padding:3px;text-align:center;vertical-align:middle"><img src="' + src + '" style="max-width:100%;max-height:240px"></td>').join('') + '</tr></table>'
      : '')
    + rubrique('RECOMMANDATION', r.Recommandation)
    + '<table style="width:100%;margin-top:14px"><tr><td style="vertical-align:top">' + visaClient(r) + '</td><td style="width:200px;text-align:center;vertical-align:top"><b style="font-size:10px;color:#0E5C8C">POUR SYMBIOSE</b><br><img src="' + IMAGES_ENTETE.signature + '" style="width:150px"></td></tr></table>';

  return cadreDocument(r.Domaine === 'Maintenance préventive' ? 'RAPPORT DE MAINTENANCE PRÉVENTIVE' : 'RAPPORT D\'INTERVENTION', numeroRapport, contenu);
}

/** Bloc « Visa du client » du PDF : nom et signature recueillis sur place (vide si l'agence n'a pas signé). */
function visaClient(r) {
  if (!r.SignatureClient) return '';
  let src = '';
  try { const b = DriveApp.getFileById(r.SignatureClient).getBlob(); src = 'data:image/png;base64,' + Utilities.base64Encode(b.getBytes()); } catch (e) { return ''; }
  return '<b style="font-size:10px;color:#0E5C8C">VISA DU CLIENT</b><br>' + echapperHtml(r.SignataireClient || '') + '<br><img src="' + src + '" style="width:170px;max-height:80px">';
}

/** Relevés du groupe électrogène et horaires de la visite préventive (vide si aucun). */
function tableauReleves(mesures) {
  const libelles = [['debut', 'Début des travaux'], ['fin', 'Fin des travaux']].concat(typeof RELEVES_GROUPE !== 'undefined' ? RELEVES_GROUPE : []);
  const presents = libelles.filter((l) => mesures[l[0]]);
  if (presents.length === 0) return '';
  const cellule = 'border:1px solid #9CA3AF;padding:4px 6px';
  const lignes = [];
  for (let i = 0; i < presents.length; i += 2) {
    lignes.push('<tr>' + presents.slice(i, i + 2).map((l) => '<td style="' + cellule + ';color:#4B5563;width:25%">' + echapperHtml(l[1]) + '</td><td style="' + cellule + ';width:25%"><b>' + echapperHtml(mesures[l[0]]) + '</b></td>').join('') + '</tr>');
  }
  return '<table style="width:100%;border-collapse:collapse;margin-top:10px">' + lignes.join('') + '</table>';
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
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.RAPPORTS);
  const ligne = trouverLigneParValeur(feuille, 'NumeroRapport', numeroRapport);
  majCellule(feuille, ligne, 'Statut', STATUTS_RAPPORT.ENVOYE);
  majCellule(feuille, ligne, 'EnvoyeLe', new Date());
  noterJournal(r.NumeroAffaire, TYPES_JOURNAL.ENVOI, 'Rapport ' + numeroRapport + ' envoyé à ' + a, utilisateur.nom);
  return a;
}
