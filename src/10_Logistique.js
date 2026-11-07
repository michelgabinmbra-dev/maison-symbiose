/**
 * Logistique : outillage (prêté puis rendu) et matériel (consommé sur un marché).
 * Tout le monde peut prendre/rendre. Jean (rôle STOCK) n'est pas sur place : il ne confirme
 * rien, il reçoit chaque matin la liste des outils non rendus avec qui les a pris et depuis
 * quand, et les écarts sur le matériel (aussi envoyés à la comptabilité). Le matériel posé devient automatiquement une dépense du marché.
 * Mise en route (une fois, depuis l'éditeur) : exécuter installerDeclencheurOutils().
 */

const STATUTS_OUTIL = {
  DISPONIBLE: 'Disponible',
  SORTI: 'Sorti',
};

const ACTIONS_OUTIL = {
  PRISE: 'Prise',
  RETOUR: 'Retour',
};

const ROLES_GESTION_STOCK = [ROLES.STOCK, ROLES.DG, ROLES.DGA];

// ---------- Outillage ----------

/**
 * Ajoute un outil. Avec une quantité > 1, chaque exemplaire est numéroté (« Perceuse n°1 »,
 * « Perceuse n°2 »…) pour savoir qui a pris lequel. photo : base64 jpeg facultatif, partagé.
 * Renvoie les noms créés.
 */
function ajouterOutil(outil, lieu, quantite, photo) {
  exigerRole(ROLES_GESTION_STOCK);
  outil = String(outil || '').trim();
  if (!outil) {
    throw new Error("Le nom de l'outil est obligatoire.");
  }
  const n = Math.max(1, Math.min(50, Math.floor(Number(quantite) || 1)));
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.STOCK_OUTILLAGE);
  const existe = (nom) => !!trouverLigneParValeur(feuille, 'Outil', nom);
  let noms;
  if (n === 1) {
    if (existe(outil)) throw new Error('Cet outil existe déjà : ' + outil);
    noms = [outil];
  } else {
    // On continue la numérotation si des exemplaires existent déjà.
    noms = [];
    for (let i = 1; noms.length < n; i++) { if (!existe(outil + ' n°' + i)) noms.push(outil + ' n°' + i); }
  }
  const idPhoto = photo ? enregistrerImageDrive(photo, 'Outil ' + outil + '.jpg') : '';
  const entetes = feuille.getRange(1, 1, 1, feuille.getLastColumn()).getValues()[0];
  noms.forEach((nom) => {
    const valeurs = { Outil: nom, Lieu: lieu || '', Statut: STATUTS_OUTIL.DISPONIBLE, DerniereMaj: new Date(), Photo: idPhoto };
    feuille.appendRow(entetes.map((e) => (valeurs[e] !== undefined ? valeurs[e] : '')));
  });
  return noms;
}

const NOM_DOSSIER_PHOTOS_LOGISTIQUE = 'Maison Symbiose - Photos outils et véhicules';

function enregistrerImageDrive(base64, nom) {
  return obtenirOuCreerDossier(NOM_DOSSIER_PHOTOS_LOGISTIQUE)
    .createFile(Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg', nom)).getId();
}

/** Image Drive en data URL pour l'afficher dans l'appli (les fichiers restent privés). */
function imageDrive(id) {
  exigerRole(Object.values(ROLES));
  if (!id) throw new Error('Pas de photo.');
  // Seulement les photos d'outils et les documents de véhicules, pas n'importe quel fichier du Drive.
  const connus = lireLignes(NOMS_FEUILLES.STOCK_OUTILLAGE).map((o) => o.Photo)
    .concat([].concat.apply([], lireLignes(NOMS_FEUILLES.VEHICULES).map((v) => Object.values(documentsVehicule(v)))));
  if (connus.indexOf(id) === -1) throw new Error('Photo introuvable.');
  const b = DriveApp.getFileById(id).getBlob();
  return 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes());
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

/** "Je rends" : l'outil redevient disponible. */
function rendreOutil(outil, lieuDeclare) {
  const utilisateur = exigerRole(Object.values(ROLES));
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.STOCK_OUTILLAGE);
  const resultat = trouverOutil(outil);
  majCellule(feuille, resultat, 'Statut', STATUTS_OUTIL.DISPONIBLE);
  majCellule(feuille, resultat, 'Lieu', lieuDeclare || '');
  majCellule(feuille, resultat, 'DerniereMaj', new Date());
  getFeuilleDonnees(NOMS_FEUILLES.MOUVEMENTS_OUTILLAGE).appendRow([
    outil, utilisateur.nom, ACTIONS_OUTIL.RETOUR, new Date(), lieuDeclare || '', '',
  ]);
}

/** Plusieurs outils d'un coup : prendre[] et rendre[] (noms d'outils), même lieu. Retourne { pris, rendus, erreurs }. */
function mouvementsOutils(prendre, rendre, lieuDeclare) {
  exigerRole(Object.values(ROLES));
  const bilan = { pris: [], rendus: [], erreurs: [] };
  (prendre || []).forEach((o) => { try { prendreOutil(o, lieuDeclare); bilan.pris.push(o); } catch (e) { bilan.erreurs.push(o + ' : ' + e.message); } });
  (rendre || []).forEach((o) => { try { rendreOutil(o, lieuDeclare); bilan.rendus.push(o); } catch (e) { bilan.erreurs.push(o + ' : ' + e.message); } });
  if (!bilan.pris.length && !bilan.rendus.length && !bilan.erreurs.length) throw new Error('Coche au moins un outil.');
  return bilan;
}

/** Outils sortis depuis plus de DELAI_ALERTE_RETOUR_OUTIL_JOURS, avec qui les a pris et depuis quand. */
function listerOutilsNonRendus() {
  const limite = new Date(Date.now() - DELAI_ALERTE_RETOUR_OUTIL_JOURS * 24 * 3600 * 1000);
  const prises = lireLignes(NOMS_FEUILLES.MOUVEMENTS_OUTILLAGE).filter((m) => m.Action === ACTIONS_OUTIL.PRISE);
  return lireLignes(NOMS_FEUILLES.STOCK_OUTILLAGE)
    .filter((o) => o.Statut === STATUTS_OUTIL.SORTI && o.DerniereMaj < limite)
    .map((o) => {
      const derniere = prises.filter((m) => m.Outil === o.Outil).sort((a, b) => b.Date - a.Date)[0];
      return {
        outil: o.Outil,
        prisPar: derniere ? derniere.Agent : 'inconnu',
        depuis: o.DerniereMaj,
        joursDeRetard: Math.floor((Date.now() - o.DerniereMaj) / (24 * 3600 * 1000)),
        lieuDeclare: o.Lieu || 'non précisé',
      };
    });
}

/** Tourne chaque matin : envoie à Jean la liste des outils non rendus et de qui les a pris. */
function verifierOutilsNonRendus() {
  const enRetard = listerOutilsNonRendus();
  const bas = listerMaterielSousSeuil();
  if (enRetard.length === 0 && bas.length === 0) {
    return;
  }
  const lignes = enRetard.map((o) => '- ' + o.outil + ' : pris par ' + o.prisPar + ' le '
    + o.depuis.toLocaleDateString('fr-FR') + ' (' + o.joursDeRetard + ' j), lieu déclaré : ' + o.lieuDeclare);
  const lignesBas = bas.map((m) => '- ' + m.materiel + ' : ' + m.quantite + ' en stock (seuil ' + m.seuil + ')');
  alerterRoles([ROLES.STOCK],
    [enRetard.length ? enRetard.length + ' outil(s) non rendu(s)' : '', bas.length ? bas.length + ' matériel(s) à racheter' : ''].filter(Boolean).join(', '),
    (enRetard.length ? 'Outils non rendus à ce jour :\n\n' + lignes.join('\n') : '')
    + (bas.length ? (enRetard.length ? '\n\n' : '') + 'Matériel sous le seuil d\'alerte :\n\n' + lignesBas.join('\n') : ''));
}

/** Matériel dont la quantité est au seuil d'alerte ou en dessous (colonne SeuilAlerte de Stock_Materiel). */
function listerMaterielSousSeuil() {
  return lireLignes(NOMS_FEUILLES.STOCK_MATERIEL)
    .filter((m) => m.Materiel && Number(m.SeuilAlerte) > 0 && Number(m.Quantite) <= Number(m.SeuilAlerte))
    .map((m) => ({ materiel: m.Materiel, quantite: Number(m.Quantite) || 0, seuil: Number(m.SeuilAlerte) }));
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

/** Plusieurs matériels sortis pour la même affaire : lignes = [{materiel, quantite}]. Tout est vérifié avant d'écrire. */
function sortirMateriels(numeroAffaire, lignes) {
  exigerRole(Object.values(ROLES));
  trouverAffaire(numeroAffaire);
  lignes = (lignes || []).filter((l) => l && l.materiel);
  if (!lignes.length) throw new Error('Ajoute au moins un matériel.');
  const demande = {};
  lignes.forEach((l) => { demande[l.materiel] = (demande[l.materiel] || 0) + Number(l.quantite); });
  Object.keys(demande).forEach((m) => {
    const r = trouverMateriel(m);
    const stock = Number(r.ligne[r.entetes.indexOf('Quantite')]) || 0;
    if (!(demande[m] > 0) || demande[m] > stock) throw new Error(m + ' : quantité invalide ' + demande[m] + ' (en stock : ' + stock + ').');
  });
  lignes.forEach((l) => sortirMateriel(l.materiel, numeroAffaire, l.quantite));
  return lignes.length;
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
    const peutCloturer = ligne.Agent === utilisateur.nom || ROLES_GESTION_STOCK.indexOf(utilisateur.role) !== -1;
    if (ligne.Materiel === materiel && ligne.NumeroAffaire === numeroAffaire
        && peutCloturer && ligne.QuantitePosee === '') {
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
      String(valeurs[index][entetes.indexOf('Agent')]) + ' a sorti ' + sortie + ' x ' + materiel + ', mais déclare ' + posee
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
    // Colonne MailCopie : autres adresses de la personne qui reçoivent aussi ses alertes (ex. DGA, 07/11).
    .reduce((t, u) => t.concat([u.Email], String(u.MailCopie || '').split(/[,;\s]+/).filter((x) => /@/.test(x))), [])
    .filter((x, i, t) => t.indexOf(x) === i);
  if (destinataires.length === 0) {
    Logger.log('Aucun destinataire pour les rôles ' + roles.join(', ') + ' : alerte non envoyée - ' + sujet);
    return;
  }
  MailApp.sendEmail(destinataires.join(','), '[Maison Symbiose] ' + sujet, message);
}
