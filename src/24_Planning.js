/**
 * Missions des techniciens et historique des sites (demande de Michel du 05/11/2026) :
 * - chaque technicien voit « Mes missions » : les interventions où il est programmé, les visites
 *   préventives de son groupe et les urgences, chacune s'ouvre pour faire le rapport ;
 * - le planning de la semaine suivante part par mail à chaque technicien le samedi à partir de
 *   18 h (au plus tard samedi soir), avec les urgences en tête ;
 * - à chaque passage, le technicien laisse par compartiment (Électricité, Groupe électrogène,
 *   Climatisation) ses observations, ses photos et « à faire au prochain passage » ; à la visite
 *   suivante sur le même site, préventive ou dépannage, il retrouve l'historique et la liste
 *   des points à faire, qu'il coche quand c'est fait.
 */

const PHOTOS_MAX_SECTION = 2;
const HEURE_ENVOI_PLANNING = 18; // samedi, heure d'Abidjan
const JOURS_PLANNING = 9; // du samedi soir au dimanche de la semaine suivante

function nomsAgents(a) {
  return String(a.Agent || '').split(/[,;]+/).map((n) => n.trim().toLowerCase()).filter(Boolean);
}

function cleSite(client, site) {
  return String(client || '').trim().toLowerCase() + '|' + String(site || '').trim().toLowerCase();
}

/** Missions ouvertes d'un utilisateur ({email, nom, role}) : programmé, groupe préventif, urgences. */
function missionsDe(utilisateur) {
  const nom = String(utilisateur.nom || '').trim().toLowerCase();
  const groupes = groupesDe(utilisateur).map((g) => g.NomGroupe);
  const rapports = lireLignes(NOMS_FEUILLES.RAPPORTS);
  // Dernière programmation de chaque affaire : un rapport fait après elle clôt la mission.
  const programmees = {};
  if (getClasseurDonnees().getSheetByName(NOMS_FEUILLES.JOURNAL)) {
    lireLignes(NOMS_FEUILLES.JOURNAL).filter((j) => j.Type === TYPES_JOURNAL.PROGRAMMATION)
      .forEach((j) => { programmees[j.NumeroAffaire] = Math.max(programmees[j.NumeroAffaire] || 0, (dateOuNull(j.Date) || 0).valueOf()); });
  }
  const faite = (a) => rapports.some((r) => r.NumeroAffaire === a.NumeroAffaire && (dateOuNull(r.Date) || 0).valueOf() >= (programmees[a.NumeroAffaire] || 0));
  return lireLignes(NOMS_FEUILLES.AFFAIRES)
    .filter((a) => a.NumeroAffaire && STATUTS_CLOS.indexOf(a.Statut) === -1)
    .filter((a) => (nom && nomsAgents(a).indexOf(nom) !== -1)
      || (a.TypeIntervention === TYPES_INTERVENTION.PREVENTIF && groupes.indexOf(a.Groupe) !== -1))
    .filter((a) => !faite(a))
    .map((a) => {
      const d = dateOuNull(a.DelaiPrevu);
      return {
        numero: a.NumeroAffaire, client: a.Client, site: a.Site || '', titre: String(a.Titre || a.TypeIntervention).replace(/^((TR|RE)\s*:\s*)+/i, ''),
        type: a.TypeIntervention, priorite: a.Priorite || '', urgence: a.Priorite === PRIORITES.ELEVEE,
        preventif: a.TypeIntervention === TYPES_INTERVENTION.PREVENTIF, groupe: a.Groupe || '', statut: a.Statut,
        date: d ? d.toISOString() : '', heure: String(a.HeureIntervention || '').replace(/^'/, ''), equipe: a.Agent || '',
      };
    })
    .sort((x, y) => (y.urgence - x.urgence) || ((x.date ? Date.parse(x.date) : 8.64e15) - (y.date ? Date.parse(y.date) : 8.64e15)));
}

/** Écran « Mes missions » de la personne connectée, avec le nombre de points à faire par site. */
function ecranMissions() {
  const u = exigerRole(Object.values(ROLES));
  const ouverts = pointsOuvertsParSite();
  return {
    missions: missionsDe(u).map((m) => Object.assign(m, { aFaire: (ouverts[cleSite(m.client, m.site)] || []).length })),
    peutEnvoyerPlanning: peutPlanifierAffaire(u),
  };
}

// ---------- Planning hebdomadaire ----------

function texteJour(d) {
  const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  // Abidjan est à l'heure UTC toute l'année.
  return jours[d.getUTCDay()] + ' ' + Utilities.formatDate(d, 'Africa/Abidjan', 'dd/MM');
}

/** Texte du planning d'une personne pour les jours à venir ; null si elle n'a rien. */
function textePlanning(utilisateur, maintenant) {
  const fin = maintenant.getTime() + JOURS_PLANNING * 864e5;
  const ouverts = pointsOuvertsParSite();
  const missions = missionsDe(utilisateur).filter((m) => m.urgence || !m.date || Date.parse(m.date) <= fin);
  if (!missions.length) return null;
  const ligne = (m) => '- ' + (m.date ? texteJour(new Date(m.date)) + (m.heure ? ' ' + m.heure : '') + ' · ' : '')
    + m.client + (m.site ? ' · ' + m.site : '') + ' : ' + m.titre
    + (m.equipe ? ' (équipe : ' + m.equipe + ')' : (m.groupe ? ' (' + m.groupe + ')' : ''))
    + ((ouverts[cleSite(m.client, m.site)] || []).length ? '\n    À faire sur ce site : ' + ouverts[cleSite(m.client, m.site)].map((p) => p.texte).join(' ; ') : '');
  const urgences = missions.filter((m) => m.urgence);
  const datees = missions.filter((m) => !m.urgence && m.date);
  const sansDate = missions.filter((m) => !m.urgence && !m.date);
  return 'Bonjour ' + String(utilisateur.nom || '').split(' ').pop() + ',\n\nVoici ton planning de la semaine.\n'
    + (urgences.length ? '\nURGENCES\n' + urgences.map(ligne).join('\n') + '\n' : '')
    + (datees.length ? '\nPROGRAMMÉ\n' + datees.map(ligne).join('\n') + '\n' : '')
    + (sansDate.length ? '\nSITES À FAIRE (jour à caler avec le planning)\n' + sansDate.map(ligne).join('\n') + '\n' : '')
    + '\nOuvre l\'application, « Mes missions », touche une mission pour voir l\'historique du site et faire ton rapport.\n\nMaison Symbiose';
}

/** Envoie à chaque technicien son planning. Renvoie {envoyes: [noms], sansMission: [noms]}. */
function envoyerPlanningsHebdo() {
  const maintenant = new Date();
  const envoyes = [];
  const sansMission = [];
  lireLignes(NOMS_FEUILLES.UTILISATEURS)
    .filter((u) => u.Email && u.Actif !== false && peutEtreDansUnGroupe(u))
    .forEach((u) => {
      const personne = { email: u.Email, nom: u.Nom || u.Email, role: u.Role };
      const texte = textePlanning(personne, maintenant);
      if (!texte) { sansMission.push(personne.nom); return; }
      MailApp.sendEmail(u.Email, '[Maison Symbiose] Ton planning de la semaine', texte);
      envoyes.push(personne.nom);
    });
  return { envoyes, sansMission };
}

/** Bouton « Envoyer le planning maintenant » (DG, DGA, droit Planning). */
function envoyerPlanningsMaintenant() {
  exigerRoleOuDroit(ROLES_CIRCUIT, DROITS.PLANNING);
  return envoyerPlanningsHebdo();
}

/**
 * Lancée toutes les 15 min avec la lecture des mails : le samedi à partir de 18 h, envoie le
 * planning une seule fois par semaine. Rien à installer en plus.
 */
function verifierPlanningHebdo(maintenant) {
  maintenant = maintenant || new Date();
  // Abidjan est à l'heure UTC toute l'année : samedi = 6.
  if (maintenant.getUTCDay() !== 6 || maintenant.getUTCHours() < HEURE_ENVOI_PLANNING) return null;
  const cle = Utilities.formatDate(maintenant, 'Africa/Abidjan', 'yyyy-MM-dd');
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('PLANNING_HEBDO') === cle) return null;
  props.setProperty('PLANNING_HEBDO', cle);
  const r = envoyerPlanningsHebdo();
  alerterRoles([ROLES.DGA], 'Planning de la semaine envoyé',
    'Planning envoyé à : ' + (r.envoyes.join(', ') || 'personne') + '.'
    + (r.sansMission.length ? '\nSans mission cette semaine : ' + r.sansMission.join(', ') + '.' : ''));
  return r;
}

// ---------- Historique du site et points à faire ----------

/** Contenu de la colonne Sections d'un rapport : {sections: [...], faits: [ids]}. */
function suiviDuRapport(r) {
  try {
    const s = JSON.parse(r.Sections || '{}');
    return { sections: s.sections || [], faits: s.faits || [] };
  } catch (e) {
    return { sections: [], faits: [] };
  }
}

function lignesTexte(t) {
  return String(t || '').split(/\n|;/).map((x) => x.replace(/^[\s\-•*]+/, '').trim()).filter(Boolean);
}

/**
 * Points « à faire » laissés sur chaque site et pas encore cochés comme faits, par clé de site.
 * Viennent de la case « À faire au prochain passage » de chaque compartiment, et de la
 * recommandation des rapports.
 */
function pointsOuvertsParSite() {
  const affaires = {};
  lireLignes(NOMS_FEUILLES.AFFAIRES).forEach((a) => { affaires[a.NumeroAffaire] = a; });
  const rapports = lireLignes(NOMS_FEUILLES.RAPPORTS).filter((r) => affaires[r.NumeroAffaire])
    .sort((x, y) => (dateOuNull(x.Date) || 0) - (dateOuNull(y.Date) || 0));
  const points = {};
  const faits = {};
  rapports.forEach((r) => {
    const a = affaires[r.NumeroAffaire];
    const cle = cleSite(a.Client, a.Site);
    const suivi = suiviDuRapport(r);
    suivi.faits.forEach((id) => { faits[id] = true; });
    const date = dateOuNull(r.Date);
    const base = { rapport: r.NumeroRapport, affaire: r.NumeroAffaire, par: r.Technicien, date: date ? date.toISOString() : '' };
    const ajout = (id, section, texte) => { (points[cle] = points[cle] || []).push(Object.assign({ id, section, texte }, base)); };
    suivi.sections.forEach((s, i) => lignesTexte(s.aFaire).forEach((t, j) => ajout(r.NumeroRapport + '#s' + i + '-' + j, s.section, t)));
    lignesTexte(r.Recommandation).forEach((t, j) => ajout(r.NumeroRapport + '#r' + j, r.Domaine === DOMAINE_PREVENTIF ? 'Général' : (r.Domaine || 'Général'), t));
  });
  Object.keys(points).forEach((k) => {
    points[k] = points[k].filter((p) => !faits[p.id]);
    if (!points[k].length) delete points[k];
  });
  return points;
}

/** Historique d'un site : derniers passages (incidents et maintenances) et points encore à faire. */
function historiqueSite(client, site) {
  const cle = cleSite(client, site);
  const affaires = {};
  lireLignes(NOMS_FEUILLES.AFFAIRES).filter((a) => cleSite(a.Client, a.Site) === cle).forEach((a) => { affaires[a.NumeroAffaire] = a; });
  const passages = lireLignes(NOMS_FEUILLES.RAPPORTS).filter((r) => affaires[r.NumeroAffaire])
    .sort((x, y) => (dateOuNull(y.Date) || 0) - (dateOuNull(x.Date) || 0))
    .slice(0, 8)
    .map((r) => {
      const d = dateOuNull(r.Date);
      const a = affaires[r.NumeroAffaire];
      return {
        rapport: r.NumeroRapport, affaire: r.NumeroAffaire, date: d ? d.toISOString() : '', par: r.Technicien,
        type: a.TypeIntervention, domaine: r.Domaine, constat: r.Constat, travaux: r.TravauxRealises || '',
        observations: suiviDuRapport(r).sections.filter((s) => s.observation).map((s) => ({ section: s.section, texte: s.observation })),
      };
    });
  return { passages, aFaire: pointsOuvertsParSite()[cle] || [] };
}

/** Enregistre les compartiments (observations, à faire, photos) et les points faits d'un rapport. */
function enregistrerSuiviRapport(numeroRapport, sections, faits) {
  const propres = (sections || []).filter((s) => s && s.section && (s.observation || s.aFaire || (s.photos || []).length));
  const ids = (faits || []).map(String).filter(Boolean);
  if (!propres.length && !ids.length) return;
  const dossier = obtenirOuCreerDossier(NOM_DOSSIER_PHOTOS_RAPPORTS);
  const stockees = propres.map((s, i) => ({
    section: String(s.section), observation: String(s.observation || '').trim(), aFaire: String(s.aFaire || '').trim(),
    photos: (s.photos || []).slice(0, PHOTOS_MAX_SECTION).map((b64, j) => dossier.createFile(
      Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', numeroRapport + '_s' + (i + 1) + '_' + (j + 1) + '.jpg')).getId()),
  }));
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.RAPPORTS);
  majCellule(feuille, trouverLigneParValeur(feuille, 'NumeroRapport', numeroRapport), 'Sections', JSON.stringify({ sections: stockees, faits: ids }));
}
