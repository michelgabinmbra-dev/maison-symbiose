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
  const texteQuand = Utilities.formatDate(quand, 'Africa/Abidjan', 'dd/MM/yyyy') + (p.heure ? ' à ' + p.heure : '');
  noterJournal(numeroAffaire, TYPES_JOURNAL.PROGRAMMATION, texteQuand + ' · ' + techs.map((t) => t.Nom).join(', '), u.nom);
  const lieu = affaire.Client + (affaire.Site ? ' · ' + affaire.Site : '');
  MailApp.sendEmail(techs.map((t) => t.Email).join(','), '[Maison Symbiose] Intervention le ' + texteQuand + ' : ' + lieu,
    'Tu es programmé(e) pour l\'affaire ' + numeroAffaire + ' (' + (affaire.Titre || affaire.TypeIntervention) + ').\n\n'
    + 'Lieu : ' + lieu + '\nQuand : ' + texteQuand + '\nÉquipe : ' + techs.map((t) => t.Nom).join(', ')
    + '\n\nAprès l\'intervention, fais ton rapport dans l\'application.');
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
  noterJournal(numeroAffaire, TYPES_JOURNAL.RAPPORT, numeroRapport + ' fait par ' + technicien, technicien);
  const r = trouverAffaire(numeroAffaire);
  const a = ligneVersObjet(r.entetes, r.ligne);
  alerterRoles([ROLES.DGA], 'Rapport à relire : ' + a.Client + (a.Site ? ' · ' + a.Site : ''),
    technicien + ' a fait le rapport ' + numeroRapport + ' pour l\'affaire ' + numeroAffaire + ' (' + (a.Titre || '') + ').\n\n'
    + 'Relis-le dans l\'application, corrige si besoin, puis envoie-le au client.');
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
