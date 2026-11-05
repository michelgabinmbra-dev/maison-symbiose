/**
 * Capture des mails : Michel ou le DGA posent le libellé Gmail "MaisonSymbiose-ATraiter" sur un
 * mail de demande (AFG, UCP-FM, ou autre) ; le script crée une affaire "à traiter" et retire le
 * libellé pour marquer le mail comme intégré. La priorité et le client exact sont ensuite
 * précisés par le DG/DGA depuis l'application (le client déduit automatiquement de l'expéditeur
 * n'est qu'une première estimation).
 *
 * Mise en route (une fois, depuis l'éditeur) : exécuter installerDeclencheurMails().
 */

const LIBELLE_GMAIL_A_TRAITER = 'MaisonSymbiose-ATraiter';
const LIBELLE_GMAIL_TRAITE = 'MaisonSymbiose-Traité';

/** À exécuter une fois pour que traiterMailsEntrants() tourne automatiquement (toutes les 15 min). */
function installerDeclencheurMails() {
  const dejaInstalle = ScriptApp.getProjectTriggers()
    .some((declencheur) => declencheur.getHandlerFunction() === 'traiterMailsEntrants');
  if (dejaInstalle) {
    Logger.log('Déclencheur déjà installé.');
    return;
  }
  ScriptApp.newTrigger('traiterMailsEntrants').timeBased().everyMinutes(15).create();
  Logger.log('Déclencheur installé : vérification des mails toutes les 15 minutes.');
}

/** Cherche les mails marqués à traiter, crée une affaire pour chacun, et marque le mail traité. */
function traiterMailsEntrants() {
  const libelleATraiter = obtenirOuCreerLibelle(LIBELLE_GMAIL_A_TRAITER);
  const libelleTraite = obtenirOuCreerLibelle(LIBELLE_GMAIL_TRAITE);

  const threads = libelleATraiter.getThreads();
  threads.forEach((thread) => {
    try {
      creerDemandeDepuisMail(thread);
      thread.removeLabel(libelleATraiter);
      thread.addLabel(libelleTraite);
    } catch (erreur) {
      Logger.log('Échec de traitement du mail "' + thread.getFirstMessageSubject() + '" : ' + erreur);
    }
  });
  // Même déclencheur (toutes les 15 min) : relances si une demande ou un rapport traîne.
  try { verifierDelais(); } catch (e) { Logger.log('Relances : ' + e); }
}

function creerDemandeDepuisMail(thread) {
  const message = thread.getMessages()[0];
  const expediteur = message.getFrom();
  const clientEstime = estimerClientDepuisExpediteur(expediteur);

  const numero = creerDemande({
    client: clientEstime,
    site: '',
    typeIntervention: TYPES_INTERVENTION.CURATIF,
    source: SOURCES_DEMANDE.MAIL,
    priorite: '', // à fixer par le DG/DGA
    titre: thread.getFirstMessageSubject(),
    description: message.getPlainBody().slice(0, 1500),
  });

  Logger.log('Affaire ' + numero + " créée depuis le mail : " + thread.getFirstMessageSubject());
  return numero;
}

/** Première estimation du client à partir de l'adresse d'expéditeur ; à corriger si besoin. */
function estimerClientDepuisExpediteur(expediteur) {
  const correspondance = /<(.+)>/.exec(expediteur);
  const adresse = String(correspondance ? correspondance[1] : expediteur).trim().toLowerCase();
  const domaine = adresse.split('@')[1];
  // Le client dont un contact (feuille Clients, ContactEmail) a le même domaine, ex. @afgbank.ci -> AFG.
  const client = lireLignes(NOMS_FEUILLES.CLIENTS).filter((c) => String(c.ContactEmail).toLowerCase()
    .split(/[,;\s]+/).some((contact) => contact && contact.split('@')[1] === domaine))[0];
  return client ? client.NomClient : adresse;
}

function obtenirOuCreerLibelle(nom) {
  return GmailApp.getUserLabelByName(nom) || GmailApp.createLabel(nom);
}

/** Change le client d'une affaire (par ex. après une estimation automatique depuis un mail). */
function corrigerClientAffaire(numeroAffaire, client, site) {
  exigerRole([ROLES.DG, ROLES.DGA]);
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.AFFAIRES);
  const resultat = trouverAffaire(numeroAffaire);
  majCellule(feuille, resultat, 'Client', client);
  if (site) {
    majCellule(feuille, resultat, 'Site', site);
  }
}
