/**
 * Alertes automatiques et envois programmés :
 * - véhicules (GNAGNE Arnaud, rôle VEHICULES) : visite technique, assurance, vidange au
 *   kilométrage, véhicule pris et jamais déposé ;
 * - rappel au DG / DGA tant que les groupes du mois ne sont pas recomposés ;
 * - chaque vendredi à 17 h, point de situation envoyé aux clients qui l'ont demandé
 *   (colonne PointHebdo = Oui dans la feuille Clients).
 * installerTousLesDeclencheurs() met en place d'un coup tous les déclencheurs de l'application.
 */

const JOURS_PREAVIS_ECHEANCE = 15;
const KM_PREAVIS_VIDANGE = 500;
const HEURES_ALERTE_VEHICULE_NON_DEPOSE = 24;

function dateOuNull(v) {
  if (v instanceof Date) return v;
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Renseigne les échéances d'un véhicule (référent véhicules, DG ou DGA). */
function enregistrerEcheancesVehicule(immatriculation, echeances) {
  exigerRole([ROLES.VEHICULES, ROLES.DG, ROLES.DGA]);
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.VEHICULES);
  const resultat = trouverLigneParValeur(feuille, 'Immatriculation', immatriculation);
  if (!resultat) throw new Error('Véhicule introuvable : ' + immatriculation);
  echeances = echeances || {};
  if (echeances.visiteTechnique !== undefined) majCellule(feuille, resultat, 'DateVisiteTechnique', echeances.visiteTechnique ? new Date(echeances.visiteTechnique) : '');
  if (echeances.assurance !== undefined) majCellule(feuille, resultat, 'DateAssurance', echeances.assurance ? new Date(echeances.assurance) : '');
  if (echeances.kmProchaineVidange !== undefined) majCellule(feuille, resultat, 'KmProchaineVidange', Number(echeances.kmProchaineVidange) || '');
}

/** Alertes d'un véhicule : [{niveau: 'retard'|'bientot', texte}]. v : ligne Vehicules ; dernier : dernier mouvement. */
function alertesVehicule(v, dernier) {
  const alertes = [];
  const maintenant = Date.now();
  [['DateVisiteTechnique', 'Visite technique'], ['DateAssurance', 'Assurance']].forEach((e) => {
    const d = dateOuNull(v[e[0]]);
    if (!d) return;
    const jours = Math.ceil((d.getTime() - maintenant) / 864e5);
    if (jours < 0) alertes.push({ niveau: 'retard', texte: e[1] + ' expirée depuis ' + (-jours) + ' j' });
    else if (jours <= JOURS_PREAVIS_ECHEANCE) alertes.push({ niveau: 'bientot', texte: e[1] + ' dans ' + jours + ' j' });
  });
  const km = dernier ? Number(dernier.Kilometrage) : null;
  const vidange = Number(v.KmProchaineVidange);
  if (km != null && vidange > 0) {
    if (km >= vidange) alertes.push({ niveau: 'retard', texte: 'Vidange dépassée de ' + (km - vidange) + ' km' });
    else if (vidange - km <= KM_PREAVIS_VIDANGE) alertes.push({ niveau: 'bientot', texte: 'Vidange dans ' + (vidange - km) + ' km' });
  }
  if (dernier && dernier.Action === ACTIONS_VEHICULE.PRISE && dernier.Date instanceof Date
    && maintenant - dernier.Date.getTime() > HEURES_ALERTE_VEHICULE_NON_DEPOSE * 3600e3) {
    alertes.push({ niveau: 'retard', texte: 'Pris par ' + dernier.Conducteur + ' le ' + Utilities.formatDate(dernier.Date, 'Africa/Abidjan', 'dd/MM') + ', pas encore déposé' });
  }
  return alertes;
}

function derniersMouvementsVehicules() {
  const derniers = {};
  lireLignes(NOMS_FEUILLES.MOUVEMENTS_VEHICULE).forEach((m) => {
    const d = derniers[m.Immatriculation];
    if (!d || m.Date > d.Date) derniers[m.Immatriculation] = m;
  });
  return derniers;
}

/** Mail du matin au référent véhicules s'il y a quelque chose à faire. */
function verifierVehicules() {
  const derniers = derniersMouvementsVehicules();
  const lignes = [];
  lireLignes(NOMS_FEUILLES.VEHICULES).forEach((v) => {
    alertesVehicule(v, derniers[v.Immatriculation]).forEach((a) => {
      lignes.push('- ' + v.Immatriculation + (v.Marque ? ' (' + v.Marque + ')' : '') + ' : ' + a.texte);
    });
  });
  if (lignes.length) {
    alerterReferentVehicules(lignes.length + ' alerte(s) véhicules', 'Véhicules à traiter :\n\n' + lignes.join('\n'));
  }
}

/** Du 1er au 5 du mois, rappelle au DG / DGA de recomposer les groupes s'ils ne l'ont pas fait. */
function rappelerGroupesDuMois() {
  const jour = Number(Utilities.formatDate(new Date(), 'Africa/Abidjan', 'd'));
  const c = groupesDuMois();
  if (jour <= 5 && c.reprise) {
    alerterRoles([ROLES.DG, ROLES.DGA], 'Groupes de ' + c.mois + ' à recomposer',
      'Les groupes de maintenance de ' + c.mois + ' ne sont pas encore faits. En attendant, ceux de ' + (c.depuis || 'aucun mois') + ' restent en vigueur.\n\n'
      + 'Dans l\'application : Maintenance préventive > Groupes du mois.');
  }
}

/** Déclencheur quotidien (7 h) : véhicules et rappel des groupes. */
function alertesQuotidiennes() {
  verifierVehicules();
  rappelerGroupesDuMois();
}

/** Chaque vendredi : point de situation aux clients qui ont PointHebdo = Oui. */
function envoyerPointsHebdomadaires() {
  const envoyes = [];
  const erreurs = [];
  lireLignes(NOMS_FEUILLES.CLIENTS)
    .filter((c) => c.NomClient && (c.PointHebdo === true || String(c.PointHebdo).toLowerCase() === 'oui'))
    .forEach((c) => {
      try {
        envoyes.push(c.NomClient + ' : ' + envoyerPointDeSituation(c.NomClient));
      } catch (e) {
        erreurs.push(c.NomClient + ' : ' + e.message);
      }
    });
  if (envoyes.length || erreurs.length) {
    alerterRoles([ROLES.DG, ROLES.DGA], 'Points de situation de la semaine',
      (envoyes.length ? 'Envoyés :\n' + envoyes.map((x) => '- ' + x).join('\n') : '')
      + (erreurs.length ? '\n\nNon envoyés :\n' + erreurs.map((x) => '- ' + x).join('\n') : ''));
  }
}

/** À lancer une fois : installe tous les déclencheurs qui manquent (sans doublon). */
function installerTousLesDeclencheurs() {
  const existants = ScriptApp.getProjectTriggers().map((d) => d.getHandlerFunction());
  const voulus = [
    ['traiterMailsEntrants', (b) => b.everyMinutes(15), 'mails entrants toutes les 15 min'],
    ['verifierOutilsNonRendus', (b) => b.everyDays(1).atHour(8), 'outils non rendus et stock bas à Jean, 8 h'],
    ['verifierFacturesEnRetard', (b) => b.everyDays(1).atHour(8), 'factures en retard, 8 h'],
    ['alertesQuotidiennes', (b) => b.everyDays(1).atHour(7), 'véhicules à Arnaud et rappel des groupes, 7 h'],
    ['envoyerPointsHebdomadaires', (b) => b.onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(17), 'point de situation aux clients le vendredi, 17 h'],
  ];
  const installes = [];
  voulus.forEach((v) => {
    if (existants.indexOf(v[0]) !== -1) return;
    v[1](ScriptApp.newTrigger(v[0]).timeBased()).create();
    installes.push(v[2]);
  });
  Logger.log(installes.length ? 'Installés : ' + installes.join(' ; ') : 'Tous les déclencheurs étaient déjà en place.');
}
