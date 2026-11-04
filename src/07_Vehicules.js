/**
 * Suivi des véhicules : "je prends" / "je dépose", avec photo + kilométrage à chaque étape.
 * Les alertes (kilométrage incohérent, véhicule non déposé) vont au référent véhicules
 * (rôle VEHICULES), PAS à Jean qui ne gère que le matériel/outillage.
 */

const ACTIONS_VEHICULE = {
  PRISE: 'Prise',
  DEPOT: 'Dépôt',
};

const NOM_DOSSIER_PHOTOS_VEHICULES = 'Maison Symbiose - Photos véhicules';

function enregistrerVehicule(immatriculation, marque, modele) {
  exigerRole([ROLES.DG, ROLES.DGA]);
  if (!immatriculation) {
    throw new Error("L'immatriculation est obligatoire.");
  }
  getFeuilleDonnees(NOMS_FEUILLES.VEHICULES).appendRow([immatriculation, marque || '', modele || '']);
}

/**
 * Déclare la prise d'un véhicule.
 * @param {string} photoBase64 image encodée en base64 (optionnelle), prise au moment de la prise.
 */
function prendreVehicule(immatriculation, conducteur, kilometrage, photoBase64) {
  const utilisateur = exigerRole(Object.values(ROLES));
  enregistrerMouvementVehicule(immatriculation, conducteur || utilisateur.nom, ACTIONS_VEHICULE.PRISE, kilometrage, '', photoBase64);
}

/**
 * Déclare le dépôt d'un véhicule et vérifie la cohérence du kilométrage parcouru depuis
 * la dernière prise. Alerte le référent véhicules si le kilométrage semble incohérent
 * (en baisse, ou trajet anormalement long).
 */
function deposerVehicule(immatriculation, conducteur, kilometrage, villeParcourue, photoBase64) {
  const utilisateur = exigerRole(Object.values(ROLES));
  const derniereprise = trouverDernierMouvementVehicule(immatriculation, ACTIONS_VEHICULE.PRISE);

  enregistrerMouvementVehicule(immatriculation, conducteur || utilisateur.nom, ACTIONS_VEHICULE.DEPOT, kilometrage, villeParcourue, photoBase64);

  if (derniereprise) {
    const kmParcourus = kilometrage - derniereprise.Kilometrage;
    if (kmParcourus < 0) {
      alerterReferentVehicules(
        'Kilométrage incohérent pour ' + immatriculation,
        'Dépôt à ' + kilometrage + ' km alors que la prise était à ' + derniereprise.Kilometrage + ' km.'
      );
    }
    return kmParcourus;
  }
  return null;
}

function enregistrerMouvementVehicule(immatriculation, conducteur, action, kilometrage, villeParcourue, photoBase64) {
  if (!immatriculation || kilometrage == null) {
    throw new Error("L'immatriculation et le kilométrage sont obligatoires.");
  }
  const photoUrl = photoBase64 ? enregistrerPhoto(photoBase64, immatriculation + '_' + action + '_' + Date.now()) : '';
  getFeuilleDonnees(NOMS_FEUILLES.MOUVEMENTS_VEHICULE).appendRow([
    immatriculation, conducteur, action, kilometrage, villeParcourue || '', photoUrl, new Date(),
  ]);
}

function trouverDernierMouvementVehicule(immatriculation, action) {
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.MOUVEMENTS_VEHICULE);
  const valeurs = feuille.getDataRange().getValues();
  const entetes = valeurs[0];
  const colImmat = entetes.indexOf('Immatriculation');
  const colAction = entetes.indexOf('Action');
  const colDate = entetes.indexOf('Date');

  let dernier = null;
  for (let i = 1; i < valeurs.length; i++) {
    if (valeurs[i][colImmat] === immatriculation && valeurs[i][colAction] === action) {
      if (!dernier || valeurs[i][colDate] > dernier._date) {
        dernier = ligneVersObjet(entetes, valeurs[i]);
        dernier._date = valeurs[i][colDate];
      }
    }
  }
  return dernier;
}

/** Enregistre une image (base64) dans un dossier Drive dédié et renvoie son URL. */
function enregistrerPhoto(photoBase64, nomFichier) {
  const dossier = obtenirOuCreerDossierPhotos();
  const donnees = Utilities.base64Decode(photoBase64);
  const blob = Utilities.newBlob(donnees, 'image/jpeg', nomFichier + '.jpg');
  const fichier = dossier.createFile(blob);
  return fichier.getUrl();
}

function obtenirOuCreerDossierPhotos() {
  const dossiers = DriveApp.getFoldersByName(NOM_DOSSIER_PHOTOS_VEHICULES);
  if (dossiers.hasNext()) {
    return dossiers.next();
  }
  return DriveApp.createFolder(NOM_DOSSIER_PHOTOS_VEHICULES);
}

/** Envoie un mail d'alerte au référent véhicules (rôle VEHICULES dans Utilisateurs). */
function alerterReferentVehicules(sujet, message) {
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.UTILISATEURS);
  const valeurs = feuille.getDataRange().getValues();
  const entetes = valeurs[0];
  const colRole = entetes.indexOf('Role');
  const colEmail = entetes.indexOf('Email');

  const destinataires = valeurs.slice(1)
    .filter((ligne) => ligne[colRole] === ROLES.VEHICULES)
    .map((ligne) => ligne[colEmail]);

  if (destinataires.length === 0) {
    Logger.log("Aucun référent véhicules enregistré (rôle VEHICULES) : alerte non envoyée - " + sujet);
    return;
  }
  MailApp.sendEmail(destinataires.join(','), '[Maison Symbiose] ' + sujet, message);
}
