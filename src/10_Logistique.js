/**
 * Logistique : outillage (prêté puis rendu) et matériel (consommé sur un marché).
 * Tout le monde peut prendre/rendre ; Jean (rôle STOCK) confirme les retours et reçoit les
 * alertes (outil non rendu, écart sur le matériel). Les alertes matériel vont aussi à la
 * comptabilité. Le matériel posé devient automatiquement une dépense du marché.
 * Mise en route (une fois, depuis l'éditeur) : exécuter installerDeclencheurOutils().
 */

const STATUTS_OUTIL = {
  DISPONIBLE: 'Disponible',
  SORTI: 'Sorti',
  RENDU_A_CONFIRMER: 'Rendu, à confirmer',
};

const ACTIONS_OUTIL = {
  PRISE: 'Prise',
  RETOUR: 'Retour',
};

const ROLES_GESTION_STOCK = [ROLES.STOCK, ROLES.DG, ROLES.DGA];

// ---------- Outillage ----------

function ajouterOutil(outil, lieu) {
  exigerRole(ROLES_GESTION_STOCK);
  if (!outil) {
    throw new Error("Le nom de l'outil est obligatoire.");
  }
  if (trouverLigneParValeur(getFeuilleDonnees(NOMS_FEUILLES.STOCK_OUTILLAGE), 'Outil', outil)) {
    throw new Error('Cet outil existe déjà : ' + outil);
  }
  getFeuilleDonnees(NOMS_FEUILLES.STOCK_OUTILLAGE).appendRow([outil, lieu || '', STATUTS_OUTIL.DISPONIBLE, new Date()]);
}

/** "Je prends" : l'outil passe en Sorti, avec le lieu où l'agent l'emporte. */
function prendreOutil(outil, lieuDeclare) {
  const utilisateur = exigerRole(Object.values(ROLES));
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.STOCK_OUTILLAGE);
  const resultat = trouverOutil(outil);
  if (resultat.ligne[resultat.entetes.indexOf('Statut')] === STATUTS_OUTIL.SORTI) {
    throw new Error('Cet outil est déjà sorti : ' + outil);
  }
  majCellule(feuille, resultat, 'Statut', STATUTS_OUTIL.SORTI);
  majCellule(feuille, resultat, 'Lieu', lieuDeclare || '');
  majCellule(feuille, resultat, 'DerniereMaj', new Date());
  getFeuilleDonnees(NOMS_FEUILLES.MOUVEMENTS_OUTILLAGE).appendRow([
    outil, utilisateur.nom, ACTIONS_OUTIL.PRISE, new Date(), lieuDeclare || '', '',
  ]);
}

/** "Je rends" : l'outil attend la confirmation de Jean. */
function rendreOutil(outil, lieuDeclare) {
  const utilisateur = exigerRole(Object.values(ROLES));
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.STOCK_OUTILLAGE);
  const resultat = trouverOutil(outil);
  majCellule(feuille, resultat, 'Statut', STATUTS_OUTIL.RENDU_A_CONFIRMER);
  majCellule(feuille, resultat, 'Lieu', lieuDeclare || '');
  majCellule(feuille, resultat, 'DerniereMaj', new Date());
  getFeuilleDonnees(NOMS_FEUILLES.MOUVEMENTS_OUTILLAGE).appendRow([
    outil, utilisateur.nom, ACTIONS_OUTIL.RETOUR, new Date(), lieuDeclare || '', false,
  ]);
}

/** Jean confirme qu'il a bien récupéré l'outil. */
function confirmerRetourOutil(outil) {
  exigerRole(ROLES_GESTION_STOCK);
  const feuilleStock = getFeuilleDonnees(NOMS_FEUILLES.STOCK_OUTILLAGE);
  const resultat = trouverOutil(outil);
  majCellule(feuilleStock, resultat, 'Statut', STATUTS_OUTIL.DISPONIBLE);
  majCellule(feuilleStock, resultat, 'DerniereMaj', new Date());

  const feuilleMouvements = getFeuilleDonnees(NOMS_FEUILLES.MOUVEMENTS_OUTILLAGE);
  const valeurs = feuilleMouvements.getDataRange().getValues();
  const entetes = valeurs[0];
  for (let i = valeurs.length - 1; i >= 1; i--) {
    if (valeurs[i][entetes.indexOf('Outil')] === outil && valeurs[i][entetes.indexOf('Action')] === ACTIONS_OUTIL.RETOUR) {
      majCellule(feuilleMouvements, { index: i + 1, ligne: valeurs[i], entetes }, 'ConfirmeParJean', true);
      break;
    }
  }
}

/** Tourne chaque jour : alerte Jean pour chaque outil sorti depuis trop longtemps. */
function verifierOutilsNonRendus() {
  const limite = new Date(Date.now() - DELAI_ALERTE_RETOUR_OUTIL_JOURS * 24 * 3600 * 1000);
  const enRetard = lireLignes(NOMS_FEUILLES.STOCK_OUTILLAGE)
    .filter((o) => o.Statut === STATUTS_OUTIL.SORTI && o.DerniereMaj < limite);
  if (enRetard.length === 0) {
    return;
  }
  const lignes = enRetard.map((o) => '- ' + o.Outil + ' (lieu déclaré : ' + (o.Lieu || 'non précisé') + ', sorti le ' + o.DerniereMaj.toLocaleDateString('fr-FR') + ')');
  alerterRoles([ROLES.STOCK], enRetard.length + ' outil(s) non rendu(s)', lignes.join('\n'));
}

function installerDeclencheurOutils() {
  const dejaInstalle = ScriptApp.getProjectTriggers()
    .some((declencheur) => declencheur.getHandlerFunction() === 'verifierOutilsNonRendus');
  if (dejaInstalle) {
    Logger.log('Déclencheur déjà installé.');
    return;
  }
  ScriptApp.newTrigger('verifierOutilsNonRendus').timeBased().everyDays(1).atHour(8).create();
  Logger.log('Déclencheur installé : vérification des outils non rendus chaque jour à 8 h.');
}

function trouverOutil(outil) {
  const resultat = trouverLigneParValeur(getFeuilleDonnees(NOMS_FEUILLES.STOCK_OUTILLAGE), 'Outil', outil);
  if (!resultat) {
    throw new Error('Outil introuvable : ' + outil);
  }
  return resultat;
}

// ---------- Matériel ----------

/** Entrée en stock (achat) : ajoute la quantité et met à jour le prix unitaire. */
function entrerMateriel(materiel, quantite, prixUnitaire) {
  exigerRole(ROLES_GESTION_STOCK);
  if (!materiel || !(Number(quantite) > 0)) {
    throw new Error('Le matériel et une quantité positive sont obligatoires.');
  }
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.STOCK_MATERIEL);
  const resultat = trouverLigneParValeur(feuille, 'Materiel', materiel);
  if (!resultat) {
    feuille.appendRow([materiel, Number(quantite), Number(prixUnitaire) || 0]);
    return;
  }
  const stockActuel = Number(resultat.ligne[resultat.entetes.indexOf('Quantite')]) || 0;
  majCellule(feuille, resultat, 'Quantite', stockActuel + Number(quantite));
  if (prixUnitaire != null && prixUnitaire !== '') {
    majCellule(feuille, resultat, 'PrixUnitaire', Number(prixUnitaire));
  }
}

/** Un agent sort du matériel pour un marché. */
function sortirMateriel(materiel, numeroAffaire, quantite) {
  const utilisateur = exigerRole(Object.values(ROLES));
  trouverAffaire(numeroAffaire);
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.STOCK_MATERIEL);
  const resultat = trouverMateriel(materiel);
  const stockActuel = Number(resultat.ligne[resultat.entetes.indexOf('Quantite')]) || 0;
  if (!(Number(quantite) > 0) || Number(quantite) > stockActuel) {
    throw new Error('Quantité invalide : ' + quantite + ' (en stock : ' + stockActuel + ').');
  }
  majCellule(feuille, resultat, 'Quantite', stockActuel - Number(quantite));
  getFeuilleDonnees(NOMS_FEUILLES.MOUVEMENTS_MATERIEL).appendRow([
    materiel, numeroAffaire, utilisateur.nom, Number(quantite), '', '', new Date(),
  ]);
}

/**
 * Fin d'intervention : l'agent déclare ce qu'il a posé et ce qu'il rapporte. Le rapporté revient
 * en stock, le posé devient une dépense Matériel du marché. Si sorti ≠ posé + rapporté, Jean et
 * la comptabilité sont alertés.
 */
function declarerRetourMateriel(materiel, numeroAffaire, quantitePosee, quantiteRapportee) {
  const utilisateur = exigerRole(Object.values(ROLES));
  const posee = Number(quantitePosee) || 0;
  const rapportee = Number(quantiteRapportee) || 0;

  const feuilleMouvements = getFeuilleDonnees(NOMS_FEUILLES.MOUVEMENTS_MATERIEL);
  const valeurs = feuilleMouvements.getDataRange().getValues();
  const entetes = valeurs[0];
  let index = -1;
  for (let i = valeurs.length - 1; i >= 1; i--) {
    const ligne = ligneVersObjet(entetes, valeurs[i]);
    if (ligne.Materiel === materiel && ligne.NumeroAffaire === numeroAffaire
        && ligne.Agent === utilisateur.nom && ligne.QuantitePosee === '') {
      index = i;
      break;
    }
  }
  if (index === -1) {
    throw new Error('Aucune sortie en cours pour ' + materiel + ' sur ' + numeroAffaire + '.');
  }
  const mouvement = { index: index + 1, ligne: valeurs[index], entetes };
  const sortie = Number(valeurs[index][entetes.indexOf('QuantiteSortie')]) || 0;
  majCellule(feuilleMouvements, mouvement, 'QuantitePosee', posee);
  majCellule(feuilleMouvements, mouvement, 'QuantiteRapportee', rapportee);

  const feuilleStock = getFeuilleDonnees(NOMS_FEUILLES.STOCK_MATERIEL);
  const stock = trouverMateriel(materiel);
  const stockActuel = Number(stock.ligne[stock.entetes.indexOf('Quantite')]) || 0;
  majCellule(feuilleStock, stock, 'Quantite', stockActuel + rapportee);

  const prixUnitaire = Number(stock.ligne[stock.entetes.indexOf('PrixUnitaire')]) || 0;
  if (posee > 0 && prixUnitaire > 0) {
    enregistrerDepense(numeroAffaire, CATEGORIES_DEPENSE.MATERIEL, posee * prixUnitaire,
      posee + ' x ' + materiel + ' (posé par ' + utilisateur.nom + ')');
  }

  if (posee + rapportee !== sortie) {
    alerterRoles([ROLES.STOCK, ROLES.COMPTABILITE],
      'Écart matériel sur ' + numeroAffaire,
      utilisateur.nom + ' a sorti ' + sortie + ' x ' + materiel + ', mais déclare ' + posee
        + ' posé(s) et ' + rapportee + ' rapporté(s). Manque : ' + (sortie - posee - rapportee) + '.');
  }
}

function trouverMateriel(materiel) {
  const resultat = trouverLigneParValeur(getFeuilleDonnees(NOMS_FEUILLES.STOCK_MATERIEL), 'Materiel', materiel);
  if (!resultat) {
    throw new Error('Matériel introuvable : ' + materiel);
  }
  return resultat;
}

// ---------- Alertes ----------

/** Envoie un mail à tous les utilisateurs actifs ayant l'un des rôles donnés. */
function alerterRoles(roles, sujet, message) {
  const destinataires = lireLignes(NOMS_FEUILLES.UTILISATEURS)
    .filter((u) => roles.indexOf(u.Role) !== -1 && u.Actif !== false && u.Email)
    .map((u) => u.Email);
  if (destinataires.length === 0) {
    Logger.log('Aucun destinataire pour les rôles ' + roles.join(', ') + ' : alerte non envoyée - ' + sujet);
    return;
  }
  MailApp.sendEmail(destinataires.join(','), '[Maison Symbiose] ' + sujet, message);
}
