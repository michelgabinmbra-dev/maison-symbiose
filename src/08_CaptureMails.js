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
  // Le samedi à partir de 18 h : planning de la semaine à chaque technicien (une fois).
  try { verifierPlanningHebdo(); } catch (e) { Logger.log('Planning hebdo : ' + e); }
}

function creerDemandeDepuisMail(thread) {
  const message = thread.getMessages()[0];
  const expediteur = message.getFrom();
  const clientEstime = estimerClientDepuisExpediteur(expediteur);

  const corps = message.getPlainBody();
  const numero = creerDemande({
    client: clientEstime,
    // Site deviné dans le mail (« agence de Jacqueville ») ; à corriger dans la fiche si besoin.
    site: deviner_site(thread.getFirstMessageSubject() + '\n' + corps),
    typeIntervention: TYPES_INTERVENTION.CURATIF,
    source: SOURCES_DEMANDE.MAIL,
    priorite: '', // à fixer par le DG/DGA
    titre: thread.getFirstMessageSubject(),
    description: corps.slice(0, 1500),
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

/** « agence de Jacqueville », « l'agence d'Adjamé Forum », « agence Adjamé Forum » → le nom du site, sinon ''. */
function deviner_site(texte) {
  const m = /agence\s+(?:de\s+|d['’]\s*|du\s+)?([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+){0,2})/.exec(String(texte || ''));
  return m && !/^(Bank|AFG|SYMBIOZ)$/i.test(m[1]) ? m[1].trim() : '';
}

/**
 * Le cœur d'un mail client, sans signatures, en-têtes de transfert ni liens : ce que le
 * technicien doit lire. Limité à 600 caractères.
 */
function resumerDemande(texte) {
  const bruit = /^(De ?:|Envoy[ée] ?:|À ?:|A ?:|Cc ?:|Objet ?:|Email ?:|T[ée]l\.? ?:|IP\/|www\.|Direction |D[ée]partement |Service |Envoy[ée] à partir de|Get Outlook|_{3,}|Cordialement|Bonjour|Merci de programmer)/i;
  const vues = {};
  return String(texte || '').replace(/\[cid:[^\]]*\]/g, '').replace(/<(mailto|https?):[^>]*>/g, '').replace(/\r/g, '')
    .split('\n').map((l) => l.trim())
    .filter((l) => l && !bruit.test(l) && !/^[A-ZÀ-Ý' -]{3,}$/.test(l) && !/^[A-ZÀ-Ý][a-zà-ÿ]+ [A-ZÀ-Ý' -]{3,}$/.test(l))
    .filter((l) => { const k = l.toLowerCase(); if (vues[k]) return false; vues[k] = true; return true; })
    .join('\n').slice(0, 600);
}

/** Titre sans « TR: », « RE: ». */
function titrePropre(t) {
  return String(t || '').replace(/^((TR|RE|FW|FWD)\s*:\s*)+/i, '').trim();
}
