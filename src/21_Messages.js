/**
 * Mail libre au client depuis une affaire (ex. « intervention programmée demain ») : DG ou DGA.
 * Chaque mail envoyé est gardé dans la feuille Messages et affiché dans la fiche de l'affaire.
 */

const MODELES_MESSAGE = [
  { nom: 'Intervention programmée', texte: 'Nous avons bien reçu votre demande. Notre équipe interviendra le [date] à [heure].' },
  { nom: 'Technicien en route', texte: 'Notre technicien est en route et sera sur place dans environ [durée].' },
  { nom: 'Intervention terminée', texte: "L'intervention est terminée et les installations ont été remises en service. Le rapport vous sera transmis sous peu." },
  { nom: 'En attente de pièces', texte: 'Le diagnostic est fait. Nous attendons les pièces nécessaires ; nous revenons vers vous dès réception pour finaliser.' },
];

/** Feuille Messages, créée au premier envoi si elle manque. */
function feuilleMessages() {
  const classeur = getClasseurDonnees();
  return classeur.getSheetByName(NOMS_FEUILLES.MESSAGES)
    || creerFeuilleSiAbsente(classeur, NOMS_FEUILLES.MESSAGES, ['NumeroAffaire', 'Date', 'Par', 'Destinataires', 'Sujet', 'Texte']);
}

/** Envoie un mail libre au client de l'affaire. m = {a: 'x@y,z@w', sujet, texte}. Renvoie les destinataires. */
function envoyerMessageClient(numeroAffaire, m) {
  const utilisateur = exigerRole([ROLES.DG, ROLES.DGA]);
  const r = trouverAffaire(numeroAffaire);
  const affaire = ligneVersObjet(r.entetes, r.ligne);
  m = m || {};
  const a = String(m.a || '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  if (!a.length) throw new Error('Choisis au moins un destinataire.');
  a.forEach((x) => { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)) throw new Error('Adresse invalide : ' + x); });
  const texte = String(m.texte || '').trim();
  if (!texte) throw new Error('Écris le message.');
  const sujet = String(m.sujet || '').trim() || sujetParDefaut(affaire);
  const corps = texte.split(/\n/).map((l) => echapperHtml(l)).join('<br>');
  MailApp.sendEmail({
    to: a.join(','), cc: utilisateur.email, name: 'Symbiose', subject: sujet,
    htmlBody: '<p>Bonjour,</p><p>' + corps + '</p><p>Cordialement,<br>' + echapperHtml(utilisateur.nom || '') + '<br>Symbiose</p>',
  });
  feuilleMessages().appendRow([numeroAffaire, new Date(), utilisateur.nom, a.join(', '), sujet, texte]);
  return a.join(', ');
}

/** Objet du mail : titre de la demande sans les « TR: » / « RE: », avec le site. */
function sujetParDefaut(affaire) {
  const titre = String(affaire.Titre || affaire.TypeIntervention || '').replace(/^((TR|RE|FW|FWD)\s*:\s*)+/i, '');
  return titre + (affaire.Site ? ' - ' + affaire.Site : '') + ' [' + affaire.NumeroAffaire + ']';
}

/** Messages déjà envoyés pour une affaire, du plus récent au plus ancien. */
function messagesDeLAffaire(numeroAffaire) {
  const classeur = getClasseurDonnees();
  if (!classeur.getSheetByName(NOMS_FEUILLES.MESSAGES)) return [];
  return lireLignes(NOMS_FEUILLES.MESSAGES).filter((x) => x.NumeroAffaire === numeroAffaire)
    .map((x) => ({ date: x.Date instanceof Date ? x.Date.toISOString() : x.Date, par: x.Par, a: x.Destinataires, sujet: x.Sujet, texte: x.Texte }))
    .reverse();
}
