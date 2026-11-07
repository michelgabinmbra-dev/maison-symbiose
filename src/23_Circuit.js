/**
 * Circuit d'une demande (décrit par Michel le 05/11/2026) :
 * 1. la demande arrive, tout le monde la voit dans les urgences ;
 * 2. Marina, le DGA ou le DT (droit Planning) appelle le client pour confirmer : l'appel est tracé ;
 * 3. Marina programme l'intervention (jour, heure, techniciens) ; les techniciens et le DGA sont prévenus ;
 * 4. le DGA peut écrire au client « nous venons tel jour avec telle personne » (modèle pré-rempli) ;
 * 5. le technicien fait son rapport : le DGA est alerté, relit, corrige si besoin, puis l'envoie ;
 * 6. sous contrat, rien à facturer, sauf si le DGA marque l'intervention « à facturer ».
 * Chaque étape est gardée dans la feuille Journal et affichée dans la fiche.
 */

const ENTETES_JOURNAL = ['NumeroAffaire', 'Date', 'Par', 'Type', 'Detail'];
const TYPES_JOURNAL = { APPEL: 'Appel', PROGRAMMATION: 'Programmation', RAPPORT: 'Rapport', ENVOI: 'Envoi', FACTURATION: 'Facturation' };
const ROLES_CIRCUIT = [ROLES.DG, ROLES.DGA];

function feuilleJournal() {
  const classeur = getClasseurDonnees();
  return classeur.getSheetByName(NOMS_FEUILLES.JOURNAL) || creerFeuilleSiAbsente(classeur, NOMS_FEUILLES.JOURNAL, ENTETES_JOURNAL);
}

function noterJournal(numeroAffaire, type, detail, par) {
  feuilleJournal().appendRow([numeroAffaire, new Date(), par || (getUtilisateurCourant() || {}).nom || '', type, String(detail || '')]);
}

function journalDeLAffaire(numeroAffaire) {
  if (!getClasseurDonnees().getSheetByName(NOMS_FEUILLES.JOURNAL)) return [];
  return lireLignes(NOMS_FEUILLES.JOURNAL).filter((j) => j.NumeroAffaire === numeroAffaire)
    .map((j) => ({ date: j.Date instanceof Date ? j.Date.toISOString() : j.Date, par: j.Par, type: j.Type, detail: j.Detail }))
    .reverse();
}

function peutPlanifierAffaire(u) {
  return !!u && (ROLES_CIRCUIT.indexOf(u.role) !== -1 || aLeDroit(u, DROITS.PLANNING));
}

/** Appel au client tracé. a = {contact, resultat: 'Confirmée'|'Injoignable'|'Reportée', note}. */
function noterAppelClient(numeroAffaire, a) {
  const u = exigerRoleOuDroit(ROLES_CIRCUIT, DROITS.PLANNING);
  a = a || {};
  const resultats = ['Confirmée', 'Injoignable', 'Reportée'];
  if (resultats.indexOf(a.resultat) === -1) throw new Error('Résultat de l\'appel invalide.');
  const r = trouverAffaire(numeroAffaire);
  const statut = r.ligne[r.entetes.indexOf('Statut')];
  if (a.resultat === 'Confirmée' && [STATUTS_AFFAIRE.NOUVELLE_DEMANDE, ''].indexOf(statut) !== -1) {
    majCellule(getFeuilleDonnees(NOMS_FEUILLES.AFFAIRES), r, 'Statut', STATUTS_AFFAIRE.CONFIRMEE);
  }
  noterJournal(numeroAffaire, TYPES_JOURNAL.APPEL, a.resultat + (a.contact ? ' · ' + a.contact : '') + (a.note ? ' · ' + a.note : ''), u.nom);
}

/** Programmation : p = {date: 'aaaa-mm-jj', heure: 'hh:mm', techniciens: [emails]}. */
function programmerIntervention(numeroAffaire, p) {
  const u = exigerRoleOuDroit(ROLES_CIRCUIT, DROITS.PLANNING);
  p = p || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.date || ''))) throw new Error('Choisis le jour de l\'intervention.');
  const equipe = lireLignes(NOMS_FEUILLES.UTILISATEURS).filter((x) => x.Email && x.Actif !== false);
  const techs = (p.techniciens || []).map((e) => equipe.filter((x) => String(x.Email).toLowerCase() === String(e).toLowerCase())[0]).filter(Boolean);
  if (!techs.length) throw new Error('Choisis au moins un technicien.');
  const r = trouverAffaire(numeroAffaire);
  const affaire = ligneVersObjet(r.entetes, r.ligne);
  const quand = new Date(p.date + 'T' + (/^\d{2}:\d{2}$/.test(String(p.heure || '')) ? p.heure : '08:00') + ':00');
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.AFFAIRES);
  majCellule(feuille, r, 'DelaiPrevu', quand);
  majCellule(feuille, r, 'Agent', techs.map((t) => t.Nom).join(', '));
  majCellule(feuille, r, 'HeureIntervention', p.heure ? "'" + p.heure : '');
  if ([STATUTS_AFFAIRE.NOUVELLE_DEMANDE, STATUTS_AFFAIRE.CONFIRMEE, ''].indexOf(affaire.Statut) !== -1) {
    majCellule(feuille, r, 'Statut', STATUTS_AFFAIRE.PROGRAMMEE);
  }
  majCellule(feuille, r, 'DateMaj', new Date());
  const texteQuand = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][quand.getUTCDay()] + ' ' + Utilities.formatDate(quand, 'Africa/Abidjan', 'dd/MM/yyyy') + (p.heure ? ' à ' + p.heure : '');
  noterJournal(numeroAffaire, TYPES_JOURNAL.PROGRAMMATION, texteQuand + ' · ' + techs.map((t) => t.Nom).join(', '), u.nom);
  const site = affaire.Site || deviner_site(affaire.Titre + '\n' + affaire.Description);
  const lieu = affaire.Client + (site ? ' · ' + site : '');
  envoyerOrdreDeMission(techs, affaire, { site, lieu, texteQuand, par: u.nom });
  alerterRoles([ROLES.DGA], 'Intervention programmée : ' + lieu,
    u.nom + ' a programmé l\'affaire ' + numeroAffaire + ' le ' + texteQuand + ' avec ' + techs.map((t) => t.Nom).join(', ')
    + '.\n\nTu peux prévenir le client depuis la fiche (Écrire au client > Intervention programmée).');
  return texteQuand;
}

/** Texte du modèle « Intervention programmée », rempli avec la programmation si elle existe. */
function texteInterventionProgrammee(affaire) {
  const d = dateOuNull(affaire.DelaiPrevu);
  if (!d) return MODELES_MESSAGE[0].texte;
  const jour = Utilities.formatDate(d, 'Africa/Abidjan', 'dd/MM/yyyy');
  const heure = String(affaire.HeureIntervention || '').replace(/^'/, '');
  return 'Nous avons bien reçu votre demande. Notre équipe' + (affaire.Agent ? ' (' + affaire.Agent + ')' : '')
    + ' interviendra le ' + jour + (heure ? ' à ' + heure : '') + '.';
}

/** Le DGA (ou le DG) décide que cette intervention se facture, même sous contrat. */
function marquerAFacturer(numeroAffaire, oui) {
  const u = exigerRole(ROLES_CIRCUIT);
  const r = trouverAffaire(numeroAffaire);
  majCellule(getFeuilleDonnees(NOMS_FEUILLES.AFFAIRES), r, 'AFacturer', oui ? 'Oui' : '');
  noterJournal(numeroAffaire, TYPES_JOURNAL.FACTURATION, oui ? 'À facturer (hors contrat)' : 'Couvert par le contrat', u.nom);
}

/** Correction d'un rapport par le DGA ou le DG avant envoi. c = {constat, cause, travaux, recommandation, localisation}. */
function modifierRapport(numeroRapport, c) {
  exigerRole(ROLES_CIRCUIT);
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.RAPPORTS);
  const r = trouverLigneParValeur(feuille, 'NumeroRapport', numeroRapport);
  if (!r) throw new Error('Rapport introuvable : ' + numeroRapport);
  c = c || {};
  if (c.constat !== undefined && !String(c.constat).trim()) throw new Error('Le constat est obligatoire.');
  [['constat', 'Constat'], ['cause', 'Cause'], ['travaux', 'TravauxRealises'], ['recommandation', 'Recommandation'], ['localisation', 'Localisation']]
    .forEach((x) => { if (c[x[0]] !== undefined) majCellule(feuille, r, x[1], String(c[x[0]])); });
}

/** Après un nouveau rapport : statut « À relire » et alerte au DGA. */
function signalerRapportARelire(numeroRapport, numeroAffaire, technicien) {
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.RAPPORTS);
  majCellule(feuille, trouverLigneParValeur(feuille, 'NumeroRapport', numeroRapport), 'Statut', STATUTS_RAPPORT.A_RELIRE);
  const rap = ligneVersObjet(trouverLigneParValeur(feuille, 'NumeroRapport', numeroRapport).entetes, trouverLigneParValeur(feuille, 'NumeroRapport', numeroRapport).ligne);
  const pieces = String(rap.PiecesHorsContrat || '').trim();
  noterJournal(numeroAffaire, TYPES_JOURNAL.RAPPORT, numeroRapport + ' fait par ' + technicien + (pieces ? ' · pièces hors contrat : ' + pieces : '') + (rap.SignatureClient ? ' · visé par ' + (rap.SignataireClient || 'le client') : ''), technicien);
  const r = trouverAffaire(numeroAffaire);
  const a = ligneVersObjet(r.entetes, r.ligne);
  alerterRoles([ROLES.DGA], (pieces ? 'Pièces hors contrat à valider : ' : 'Rapport à relire : ') + a.Client + (a.Site ? ' · ' + a.Site : ''),
    technicien + ' a fait le rapport ' + numeroRapport + ' pour l\'affaire ' + numeroAffaire + ' (' + (a.Titre || '') + ').\n\n'
    + (pieces ? 'IL SIGNALE DES PIÈCES HORS CONTRAT : ' + pieces + '\nFais la proforma et obtiens l\'accord du client avant de les poser.\n\n' : '')
    + 'Relis le rapport dans l\'application, corrige si besoin, puis envoie-le au client.');
}

const STATUTS_RAPPORT = { A_RELIRE: 'À relire', ENVOYE: 'Envoyé' };

/** Rapports faits par les techniciens et pas encore envoyés au client. */
function rapportsARelire() {
  const affaires = {};
  lireLignes(NOMS_FEUILLES.AFFAIRES).forEach((a) => { affaires[a.NumeroAffaire] = a; });
  return lireLignes(NOMS_FEUILLES.RAPPORTS).filter((r) => r.Statut === STATUTS_RAPPORT.A_RELIRE)
    .map((r) => ({ numero: r.NumeroRapport, affaire: r.NumeroAffaire, technicien: r.Technicien,
      client: (affaires[r.NumeroAffaire] || {}).Client || '', titre: String((affaires[r.NumeroAffaire] || {}).Titre || '').replace(/^((TR|RE)\s*:\s*)+/i, '') }));
}

/** Nouvelle demande sans priorité : le DGA et le DG la fixent. */
function alerterPrioriteAFixer(numero, details) {
  alerterRoles([ROLES.DGA, ROLES.DG], 'Nouvelle demande à prioriser : ' + details.client + (details.site ? ' · ' + details.site : ''),
    'Demande ' + numero + ' : ' + String(details.titre || '').replace(/^((TR|RE)\s*:\s*)+/i, '') + '\n\n'
    + 'Ouvre-la dans l\'application et fixe la priorité (Élevée, Moyenne, Faible) pour que l\'équipe la voie dans le bon ordre.');
}

const HEURES_RELANCE_CONFIRMATION = 2;
const HEURES_RELANCE_PRIORITE = 2;
const HEURES_RELANCE_RAPPORT = 24;
// Les relances ne concernent que ce qui arrive après leur mise en service (pas de rafale sur l'existant).
var DEBUT_RELANCES = new Date('2026-11-05T23:00:00Z');

/**
 * Relances (une seule fois par sujet), lancées toutes les 15 min avec la lecture des mails :
 * - urgence (Élevée) ni confirmée ni programmée 2 h après son arrivée → DGA et planificateurs ;
 * - demande toujours sans priorité 2 h après → DGA et DG ;
 * - rapport « À relire » depuis 24 h → DGA et DG.
 */
function verifierDelais() {
  const props = PropertiesService.getScriptProperties();
  let deja = {};
  try { deja = JSON.parse(props.getProperty('RELANCES') || '{}'); } catch (e) { deja = {}; }
  const maintenant = Date.now();
  const heures = (d) => (dateOuNull(d) ? (maintenant - dateOuNull(d).getTime()) / 3600e3 : 0);
  const fermes = STATUTS_CLOS;
  const nouveaux = {};
  lireLignes(NOMS_FEUILLES.AFFAIRES).forEach((a) => {
    if (!a.NumeroAffaire || fermes.indexOf(a.Statut) !== -1 || !(dateOuNull(a.DateCreation) > DEBUT_RELANCES)) return;
    const lieu = a.Client + (a.Site ? ' · ' + a.Site : '');
    const titre = String(a.Titre || '').replace(/^((TR|RE)\s*:\s*)+/i, '');
    if (a.Priorite === PRIORITES.ELEVEE && [STATUTS_AFFAIRE.NOUVELLE_DEMANDE, ''].indexOf(a.Statut) !== -1
      && heures(a.DateCreation) >= HEURES_RELANCE_CONFIRMATION && !deja['appel:' + a.NumeroAffaire]) {
      const dest = emailsAvecDroit(DROITS.PLANNING);
      const msg = 'L\'urgence ' + a.NumeroAffaire + ' (' + lieu + ' : ' + titre + ') est arrivée il y a plus de ' + HEURES_RELANCE_CONFIRMATION
        + ' h et le client n\'a pas encore été appelé.\n\nAppelle-le, note l\'appel dans la fiche, puis programme l\'intervention.';
      if (dest.length) MailApp.sendEmail(dest.join(','), '[Maison Symbiose] URGENCE sans réponse : ' + lieu, msg);
      alerterRoles([ROLES.DGA], 'URGENCE sans réponse : ' + lieu, msg);
      nouveaux['appel:' + a.NumeroAffaire] = maintenant;
    }
    if (!a.Priorite && a.Source !== SOURCES_DEMANDE.PLANIFIE && heures(a.DateCreation) >= HEURES_RELANCE_PRIORITE && !deja['prio:' + a.NumeroAffaire]) {
      alerterRoles([ROLES.DGA, ROLES.DG], 'Demande toujours sans priorité : ' + lieu,
        'La demande ' + a.NumeroAffaire + ' (' + titre + ') attend sa priorité depuis plus de ' + HEURES_RELANCE_PRIORITE + ' h.');
      nouveaux['prio:' + a.NumeroAffaire] = maintenant;
    }
  });
  lireLignes(NOMS_FEUILLES.RAPPORTS).forEach((r) => {
    if (r.Statut !== STATUTS_RAPPORT.A_RELIRE || !(dateOuNull(r.Date) > DEBUT_RELANCES) || heures(r.Date) < HEURES_RELANCE_RAPPORT || deja['rap:' + r.NumeroRapport]) return;
    alerterRoles([ROLES.DGA, ROLES.DG], 'Rapport en attente depuis 24 h : ' + r.NumeroRapport,
      'Le rapport ' + r.NumeroRapport + ' (affaire ' + r.NumeroAffaire + ', ' + r.Technicien + ') attend d\'être relu et envoyé au client depuis plus de ' + HEURES_RELANCE_RAPPORT + ' h.');
    nouveaux['rap:' + r.NumeroRapport] = maintenant;
  });
  if (Object.keys(nouveaux).length) {
    // On oublie les relances de plus de 30 jours.
    Object.keys(deja).forEach((k) => { if (maintenant - deja[k] > 30 * 864e5) delete deja[k]; });
    props.setProperty('RELANCES', JSON.stringify(Object.assign(deja, nouveaux)));
  }
  return Object.keys(nouveaux);
}

/**
 * Mail « ordre de mission » aux techniciens programmés : où, quand, quoi (résumé du mail du
 * client), avec qui, la priorité, ce qui reste à faire sur ce site et le lien vers l'appli.
 */
function envoyerOrdreDeMission(techs, affaire, x) {
  const e = echapperHtml;
  const titre = titrePropre(affaire.Titre) || affaire.TypeIntervention;
  const resume = resumerDemande(affaire.Description);
  let aFaire = [];
  try { aFaire = historiqueSite(affaire.Client, x.site).aFaire; } catch (err) { aFaire = []; }
  const type = affaire.TypeIntervention === TYPES_INTERVENTION.CURATIF ? 'Dépannage (maintenance curative)'
    : affaire.TypeIntervention === TYPES_INTERVENTION.PREVENTIF ? 'Maintenance préventive' : affaire.TypeIntervention;
  const tel = (/T[ée]l[^:\n]*:\s*([0-9 ./+-]{8,})/i.exec(String(affaire.Description || '')) || [])[1];
  const appel = journalDeLAffaire(affaire.NumeroAffaire).filter((j) => j.type === TYPES_JOURNAL.APPEL)[0];
  const contact = [appel ? String(appel.detail).split(' · ').slice(1).join(' · ') : '', tel ? 'tél. ' + tel.replace(/\s+/g, ' ').trim() : ''].filter(Boolean).join(' · ');
  const ligne = (k, v) => (v ? '<tr><td style="padding:6px 12px 6px 0;color:#5A6585;white-space:nowrap;vertical-align:top">' + k + '</td><td style="padding:6px 0;font-weight:600;color:#0F1733">' + v + '</td></tr>' : '');
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#0F1733;max-width:560px">'
    + '<div style="background:#0B1442;color:#fff;border-radius:14px 14px 0 0;padding:16px 18px"><div style="font-size:12px;letter-spacing:.08em;color:#C7D2FE">ORDRE DE MISSION · ' + e(affaire.NumeroAffaire) + '</div>'
    + '<div style="font-size:20px;font-weight:bold;margin-top:4px">' + e(x.texteQuand) + '</div><div style="font-size:16px;margin-top:2px">' + e(x.lieu) + '</div></div>'
    + '<div style="border:1px solid #E3E7F2;border-top:0;border-radius:0 0 14px 14px;padding:16px 18px">'
    + (affaire.Priorite === PRIORITES.ELEVEE ? '<div style="background:#FEE2E2;color:#B91C1C;font-weight:bold;border-radius:8px;padding:6px 10px;display:inline-block;margin-bottom:10px">URGENT</div>' : '')
    + '<table style="border-collapse:collapse">'
    + ligne('Client', e(affaire.Client)) + ligne('Site', x.site ? e(x.site) : '<span style="color:#B45309">à confirmer avec ' + e(x.par) + '</span>')
    + ligne('Intervention', e(type)) + ligne('Objet', e(titre)) + ligne('Équipe', e(techs.map((t) => t.Nom).join(', ')))
    + ligne('Contact client', e(contact)) + ligne('Programmé par', e(x.par)) + '</table>'
    + (resume ? '<div style="margin-top:12px;font-size:12px;letter-spacing:.06em;color:#0E5C8C;font-weight:bold">CE QUE LE CLIENT SIGNALE</div><div style="background:#F3F5FB;border-radius:10px;padding:10px 12px;margin-top:4px;white-space:pre-line">' + e(resume) + '</div>' : '')
    + (aFaire.length ? '<div style="margin-top:12px;font-size:12px;letter-spacing:.06em;color:#B45309;font-weight:bold">À FAIRE SUR CE SITE (DERNIERS PASSAGES)</div><ul style="margin:4px 0 0;padding-left:18px">' + aFaire.map((p) => '<li>' + e(p.section) + ' : ' + e(p.texte) + '</li>').join('') + '</ul>' : '')
    + '<p style="margin:16px 0 0">Ouvre l\'application, <b>Mes missions</b>, pour voir la fiche complète. Après l\'intervention, fais ton rapport dans l\'appli.</p>'
    + '<p style="margin:14px 0 0"><a href="https://symbioz-ci.github.io" style="background:#3B82F6;color:#fff;text-decoration:none;font-weight:bold;border-radius:10px;padding:10px 16px;display:inline-block">Ouvrir Maison Symbiose</a></p>'
    + '</div></div>';
  const texte = 'ORDRE DE MISSION ' + affaire.NumeroAffaire + '\n\nQuand : ' + x.texteQuand + '\nClient : ' + affaire.Client
    + '\nSite : ' + (x.site || 'à confirmer avec ' + x.par) + '\nIntervention : ' + type + (affaire.Priorite === PRIORITES.ELEVEE ? ' (URGENT)' : '')
    + '\nObjet : ' + titre + '\nÉquipe : ' + techs.map((t) => t.Nom).join(', ') + (contact ? '\nContact client : ' + contact : '') + '\nProgrammé par : ' + x.par
    + (resume ? '\n\nCe que le client signale :\n' + resume : '')
    + (aFaire.length ? '\n\nÀ faire sur ce site :\n' + aFaire.map((p) => '- ' + p.section + ' : ' + p.texte).join('\n') : '')
    + '\n\nOuvre l\'application (https://symbioz-ci.github.io), Mes missions. Après l\'intervention, fais ton rapport dans l\'appli.';
  MailApp.sendEmail({
    to: techs.map((t) => t.Email).join(','), name: 'Maison Symbiose',
    subject: (affaire.Priorite === PRIORITES.ELEVEE ? 'URGENT · ' : '') + 'Mission le ' + x.texteQuand + ' · ' + x.lieu + ' · ' + titre,
    body: texte, htmlBody: html,
  });
}
