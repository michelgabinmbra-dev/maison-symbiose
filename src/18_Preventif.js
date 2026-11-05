/**
 * Maintenance préventive par groupes. Le DG ou le DGA planifie un passage (client, trimestre,
 * sites, groupe) : une affaire « Préventif / Planifié » est créée par site. Chaque groupe (chef +
 * membres, feuille Groupes) voit ses visites sur son téléphone et remplit la fiche de visite,
 * qui reprend le Jotform « GESTION DE MAINTENANCE » : Électricité, Groupe électrogène,
 * Climatisation (chaque point OK / À surveiller / HS + observation), relevés du groupe
 * (heures, carburant, filtres), rapport et recommandations, 2 photos. Le rapport PDF sur papier
 * en-tête est produit automatiquement à partir de la fiche.
 */

const DOMAINE_PREVENTIF = 'Maintenance préventive';
const SECTIONS_PREVENTIF = ['Électricité', 'Groupe électrogène', 'Climatisation'];
// Points contrôlés par défaut ; modifiables dans la feuille Checklist_Preventif (Section, Element).
const CHECKLIST_PREVENTIF_DEFAUT = {
  'Électricité': ['Tableau général (TGBT)', 'Disjoncteurs et différentiels', 'Serrage des connexions', 'Prises et éclairage', 'Onduleurs', 'Parafoudre', 'Mise à la terre'],
  'Groupe électrogène': ['Niveau d\'huile', 'Liquide de refroidissement', 'Batterie et charge', 'Courroies', 'Fuites', 'Test de démarrage', 'Inverseur automatique'],
  'Climatisation': ['Filtres', 'Évaporateur', 'Condenseur', 'Pression de gaz', 'Évacuation des condensats', 'Intensité du compresseur', 'Température de soufflage'],
};
const RELEVES_GROUPE = [
  ['marque', 'Marque du groupe'], ['serie', 'N° de série'], ['heures', 'Heures de fonctionnement'],
  ['carburant', 'Niveau de carburant'], ['filtreHuile', 'N° filtre à huile'], ['filtreAir', 'N° filtre à air'],
  ['filtreGasoil', 'N° filtre à gasoil'],
];

function checklistPreventif() {
  let lignes = [];
  try {
    lignes = lireLignes(NOMS_FEUILLES.CHECKLIST_PREVENTIF).filter((l) => l.Section && l.Element);
  } catch (e) {
    lignes = [];
  }
  if (lignes.length === 0) return CHECKLIST_PREVENTIF_DEFAUT;
  const resultat = {};
  SECTIONS_PREVENTIF.forEach((s) => { resultat[s] = []; });
  lignes.forEach((l) => { (resultat[l.Section] = resultat[l.Section] || []).push(String(l.Element)); });
  return resultat;
}

/** Groupes dont l'utilisateur est chef ou membre (tous pour le DG et le DGA). */
function moisCourant() {
  return Utilities.formatDate(new Date(), 'Africa/Abidjan', 'yyyy-MM');
}

/**
 * Les groupes changent chaque mois : chaque ligne de la feuille Groupes porte son mois (aaaa-mm).
 * Renvoie la composition du mois demandé ; tant qu'elle n'est pas faite, celle du dernier mois
 * saisi reste en vigueur (avec reprise = true).
 */
function groupesDuMois(mois) {
  mois = mois || moisCourant();
  const tous = lireLignes(NOMS_FEUILLES.GROUPES).filter((g) => g.NomGroupe && g.Actif !== false);
  const moisDe = (g) => (g.Mois instanceof Date ? Utilities.formatDate(g.Mois, 'Africa/Abidjan', 'yyyy-MM') : String(g.Mois || ''));
  const duMois = tous.filter((g) => moisDe(g) === mois);
  if (duMois.length) return { mois, groupes: duMois, reprise: false };
  const precedents = tous.map(moisDe).filter((m) => m && m < mois).sort();
  const dernier = precedents[precedents.length - 1];
  return { mois, groupes: tous.filter((g) => moisDe(g) === (dernier || '')), reprise: true, depuis: dernier || '' };
}

/** Remplace la composition des groupes d'un mois. groupes : [{nom, chefEmail, membres: [emails], zone}]. */
function enregistrerGroupesDuMois(mois, groupes) {
  exigerRoleOuDroit([ROLES.DG, ROLES.DGA], DROITS.PLANNING);
  mois = mois || moisCourant();
  if (!/^\d{4}-\d{2}$/.test(mois)) throw new Error('Mois invalide : ' + mois + ' (format aaaa-mm).');
  const utilisateurs = lireLignes(NOMS_FEUILLES.UTILISATEURS);
  const nomDe = (email) => ((utilisateurs.filter((u) => String(u.Email).toLowerCase() === String(email).toLowerCase())[0]) || {}).Nom || email;
  const propres = (groupes || []).filter((g) => g && g.nom && g.chefEmail);
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.GROUPES);
  const verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  try {
    const valeurs = feuille.getDataRange().getValues();
    const colMois = valeurs[0].indexOf('Mois');
    if (colMois === -1) throw new Error('Colonne Mois absente de la feuille Groupes.');
    for (let i = valeurs.length - 1; i >= 1; i--) {
      const m = valeurs[i][colMois] instanceof Date ? Utilities.formatDate(valeurs[i][colMois], 'Africa/Abidjan', 'yyyy-MM') : String(valeurs[i][colMois]);
      if (m === mois) feuille.deleteRow(i + 1);
    }
    propres.forEach((g) => feuille.appendRow([
      String(g.nom), nomDe(g.chefEmail), String(g.chefEmail), (g.membres || []).join(', '), String(g.zone || ''), true, "'" + mois,
    ]));
  } finally {
    verrou.releaseLock();
  }
  return propres.length;
}

/** Écran de composition des groupes du mois (DG, DGA ou personne ayant le droit Planning). */
function ecranGroupes(mois) {
  exigerRoleOuDroit([ROLES.DG, ROLES.DGA], DROITS.PLANNING);
  const c = groupesDuMois(mois);
  return {
    mois: c.mois, reprise: c.reprise, depuis: c.depuis || '',
    groupes: c.groupes.map((g) => ({
      nom: g.NomGroupe, chefEmail: g.ChefEmail, zone: g.Zone || '',
      membres: String(g.Membres || '').split(/[,;\s]+/).filter(Boolean),
    })),
    personnes: lireLignes(NOMS_FEUILLES.UTILISATEURS)
      .filter((u) => u.Email && u.Actif !== false && peutEtreDansUnGroupe(u))
      .map((u) => ({ email: u.Email, nom: u.Nom || u.Email })),
  };
}

/**
 * Personnes proposées pour les groupes : le terrain seulement. La direction et la comptabilité
 * n'y sont pas ; le suivi des véhicules non plus (Barbara, demande de Michel du 05/11), sauf
 * s'il est aussi technicien (Gnagne Arnaud, technicien groupe électrogène).
 */
function peutEtreDansUnGroupe(u) {
  if ([ROLES.DG, ROLES.DGA, ROLES.COMPTABILITE].indexOf(u.Role) !== -1) return false;
  if (u.Role === ROLES.VEHICULES) return /techni/i.test(String(u.Fonction || ''));
  return true;
}

function groupesDe(utilisateur) {
  const groupes = groupesDuMois().groupes;
  if (utilisateur.role === ROLES.DG || utilisateur.role === ROLES.DGA) return groupes;
  const email = String(utilisateur.email).toLowerCase();
  return groupes.filter((g) => String(g.ChefEmail).toLowerCase() === email
    || String(g.Membres || '').toLowerCase().split(/[,;\s]+/).indexOf(email) !== -1);
}

function trimestreCourant() {
  const d = new Date();
  return d.getFullYear() + '-T' + (Math.floor(d.getMonth() / 3) + 1);
}

/**
 * Planifie un passage préventif : une affaire par site, assignée au groupe. Renvoie les numéros.
 * details : {client, sites: [..], groupe, trimestre, datePrevue}
 */
function planifierPreventif(details) {
  exigerRoleOuDroit([ROLES.DG, ROLES.DGA], DROITS.PLANNING);
  if (!details || !details.client || !details.groupe || !(details.sites || []).length) {
    throw new Error('Client, groupe et au moins un site sont obligatoires.');
  }
  const groupe = groupesDuMois().groupes.filter((g) => g.NomGroupe === details.groupe)[0];
  if (!groupe) {
    throw new Error('Groupe inconnu ce mois-ci : ' + details.groupe + '.');
  }
  const trimestre = details.trimestre || trimestreCourant();
  const deja = lireLignes(NOMS_FEUILLES.AFFAIRES).filter((a) => a.Client === details.client
    && a.TypeIntervention === TYPES_INTERVENTION.PREVENTIF && String(a.Titre).indexOf(trimestre) !== -1);
  return details.sites.filter((site) => !deja.some((a) => a.Site === site)).map((site) => {
    const numero = creerDemande({
      client: details.client, site, typeIntervention: TYPES_INTERVENTION.PREVENTIF, source: SOURCES_DEMANDE.PLANIFIE,
      groupe: details.groupe, titre: 'Maintenance préventive ' + trimestre, agent: groupe.NomChef || '',
    });
    if (details.datePrevue) {
      mettreAJourSuivi(numero, { delaiPrevu: details.datePrevue, prochaineAction: 'Visite préventive (' + details.groupe + ')' });
    }
    return numero;
  });
}

/** Écran « Préventif » : visites à faire et faites des groupes de l'utilisateur. */
function ecranPreventif() {
  const utilisateur = exigerRole(Object.values(ROLES));
  const groupes = groupesDe(utilisateur);
  const noms = groupes.map((g) => g.NomGroupe);
  const rapports = lireLignes(NOMS_FEUILLES.RAPPORTS).filter((r) => r.Domaine === DOMAINE_PREVENTIF);
  const visites = lireLignes(NOMS_FEUILLES.AFFAIRES)
    .filter((a) => a.TypeIntervention === TYPES_INTERVENTION.PREVENTIF && noms.indexOf(a.Groupe) !== -1
      && a.Statut !== STATUTS_AFFAIRE.ABANDONNEE)
    .map((a) => {
      const r = rapports.filter((x) => x.NumeroAffaire === a.NumeroAffaire).pop();
      return {
        numero: a.NumeroAffaire, client: a.Client, site: a.Site, groupe: a.Groupe, titre: a.Titre,
        prevue: a.DelaiPrevu instanceof Date ? a.DelaiPrevu : null, faite: !!r, rapport: r ? r.NumeroRapport : '',
        date: r ? r.Date : null,
      };
    })
    .sort((x, y) => (x.faite - y.faite) || ((x.prevue || 8.64e15) - (y.prevue || 8.64e15)));
  return {
    groupes: groupes.map((g) => ({ nom: g.NomGroupe, chef: g.NomChef || g.ChefEmail, zone: g.Zone || '' })),
    visites,
    peutPlanifier: utilisateur.role === ROLES.DG || utilisateur.role === ROLES.DGA || aLeDroit(utilisateur, DROITS.PLANNING),
    peutComposerGroupes: utilisateur.role === ROLES.DG || utilisateur.role === ROLES.DGA || aLeDroit(utilisateur, DROITS.PLANNING),
    trimestre: trimestreCourant(),
  };
}

/** Données de la fiche de visite d'une affaire préventive. */
function ficheVisite(numeroAffaire) {
  exigerRole(Object.values(ROLES));
  const ra = trouverAffaire(numeroAffaire);
  const a = ligneVersObjet(ra.entetes, ra.ligne);
  return {
    affaire: { numero: a.NumeroAffaire, client: a.Client, site: a.Site, groupe: a.Groupe, titre: a.Titre },
    sections: SECTIONS_PREVENTIF, checklist: checklistPreventif(), releves: RELEVES_GROUPE, etats: ETATS_CONTROLE,
    historique: historiqueSite(a.Client, a.Site),
  };
}

/**
 * Enregistre la fiche de visite préventive comme rapport (domaine « Maintenance préventive »).
 * fiche : {controles: [{section, element, etat, observation}], releves: {heures, ...}, rapport,
 * recommandation, debut, fin, photos: [base64], sections: [{section, observation, aFaire, photos}],
 * faits: [ids des points à faire du site réalisés]}. Renvoie le numéro du rapport.
 */
function enregistrerVisitePreventive(numeroAffaire, fiche) {
  const utilisateur = exigerRole(Object.values(ROLES));
  const ra = trouverAffaire(numeroAffaire);
  const a = ligneVersObjet(ra.entetes, ra.ligne);
  if (utilisateur.role !== ROLES.DG && utilisateur.role !== ROLES.DGA
    && groupesDe(utilisateur).map((g) => g.NomGroupe).indexOf(a.Groupe) === -1) {
    throw new Error("Cette visite est assignée au groupe " + a.Groupe + ", pas au tien.");
  }
  fiche = fiche || {};
  const controles = (fiche.controles || []).filter((c) => c && c.element && SECTIONS_PREVENTIF.indexOf(c.section) !== -1);
  const hs = controles.filter((c) => c.etat === 'HS');
  const releves = {};
  RELEVES_GROUPE.forEach((r) => { if (fiche.releves && fiche.releves[r[0]]) releves[r[0]] = String(fiche.releves[r[0]]); });
  if (fiche.debut) releves.debut = String(fiche.debut);
  if (fiche.fin) releves.fin = String(fiche.fin);

  const numero = creerRapport(numeroAffaire, {
    domaine: DOMAINE_PREVENTIF,
    localisation: '',
    constat: fiche.rapport || (hs.length ? hs.length + ' point(s) hors service relevé(s).' : 'Visite préventive effectuée, aucun point hors service.'),
    travaux: 'Contrôle préventif des installations' + (fiche.debut ? ' de ' + fiche.debut : '') + (fiche.fin ? ' à ' + fiche.fin : '') + '.',
    recommandation: fiche.recommandation || '',
    controles,
    photos: fiche.photos || [],
    // Par compartiment : observations, à faire au prochain passage, photos ; et points du site faits.
    sections: (fiche.sections || []).filter((x) => x && SECTIONS_PREVENTIF.indexOf(x.section) !== -1),
    faits: fiche.faits || [],
  });
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.RAPPORTS);
  majCellule(feuille, trouverLigneParValeur(feuille, 'NumeroRapport', numero), 'Mesures', JSON.stringify(releves));

  const contrat = estSousContrat(a);
  mettreAJourSuivi(numeroAffaire, {
    avancement: 100,
    prochaineAction: hs.length ? (contrat ? 'Intervention curative (contrat) pour ' : 'Proforma pour ') + hs.length + ' point(s) HS' : '',
    blocage: '',
  });
  // Sous contrat et rien à reprendre : le dossier est clos, il n'y a rien à facturer.
  if (contrat && !hs.length) changerStatutAffaire(numeroAffaire, STATUTS_AFFAIRE.CLOTUREE);
  if (hs.length) {
    alerterRoles([ROLES.DG, ROLES.DGA], 'Préventif ' + a.Client + (a.Site ? ' ' + a.Site : '') + ' : ' + hs.length + ' point(s) HS',
      'Rapport ' + numero + ' (' + a.Groupe + ') :\n\n' + hs.map((c) => '- ' + c.section + ' · ' + c.element + (c.observation ? ' : ' + c.observation : '')).join('\n')
      + '\n\nOuvre l\'affaire ' + numeroAffaire + (contrat ? ' : réparation couverte par le contrat de maintenance.' : ' pour faire la proforma.'));
  }
  return numero;
}
