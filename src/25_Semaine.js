/**
 * Programme de la semaine (demande de Michel du 17/11/2026) :
 * - la comptable voit, jour par jour, les interventions de la semaine : client, site, équipe,
 *   véhicule ou transport, accessoires prévus (proforma, sorties de stock) ;
 * - sur chaque mission, deux montants à prévoir, « Transport » et « Accessoires », qu'elle corrige
 *   à la main puis marque « Payé » (date, montant, à qui). Un paiement devient une dépense de
 *   l'affaire, donc il compte dans le bénéfice ;
 * - en haut : prévu, payé, reste à payer ; ses notes restent attachées à chaque mission (Journal) ;
 * - le DG a le résumé sur son accueil, et par mail le lundi matin (avec les alertes de 7 h).
 * Les montants sont gardés dans la feuille Frais_Mission, créée toute seule au premier usage.
 */

const ENTETES_FRAIS = ['NumeroAffaire', 'Poste', 'Montant', 'Statut', 'PayeLe', 'PayeA', 'MontantPaye', 'PayePar', 'NumeroDepense', 'DateMaj'];
const NOM_FEUILLE_FRAIS = 'Frais_Mission';
const POSTES_FRAIS = { TRANSPORT: 'Transport', ACCESSOIRES: 'Accessoires' };
const CATEGORIE_POSTE = { Transport: 'Transport / carburant', Accessoires: 'Matériel' };
const ROLES_SEMAINE = [ROLES.DG, ROLES.DGA, ROLES.COMPTABILITE];
const NOTE_COMPTA = 'Note compta';

function feuilleFrais() {
  const classeur = getClasseurDonnees();
  return classeur.getSheetByName(NOM_FEUILLE_FRAIS) || creerFeuilleSiAbsente(classeur, NOM_FEUILLE_FRAIS, ENTETES_FRAIS);
}

function lireFrais() {
  return getClasseurDonnees().getSheetByName(NOM_FEUILLE_FRAIS) ? lireLignes(NOM_FEUILLE_FRAIS) : [];
}

/** Lundi 00:00 (Abidjan = UTC) de la semaine qui contient la date (aaaa-mm-jj ou Date). */
function lundiDe(date) {
  const d = date ? new Date(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date + 'T00:00:00Z' : date) : new Date();
  if (isNaN(d.getTime())) throw new Error('Date invalide : ' + date);
  const l = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  l.setUTCDate(l.getUTCDate() - ((l.getUTCDay() + 6) % 7));
  return l;
}

function ymdUTC(d) {
  return d.toISOString().slice(0, 10);
}

/** Coût des lignes de la dernière proforma de l'affaire (ce qu'il faut acheter). */
function accessoiresProforma(numeroAffaire, devis, lignes) {
  const siens = devis.filter((d) => d.NumeroAffaire === numeroAffaire);
  const valide = siens.filter((d) => /valid/i.test(String(d.Statut || ''))).pop();
  const dv = valide || siens[siens.length - 1];
  if (!dv) return { lignes: [], cout: 0, devis: '' };
  const l = lignes.filter((x) => x.NumeroDevis === dv.NumeroDevis).map((x) => ({
    designation: String(x.Designation || ''), quantite: Number(x.Quantite) || 0, cout: (Number(x.Quantite) || 0) * (Number(x.CoutUnitaire) || 0),
  }));
  return { lignes: l, cout: l.reduce((t, x) => t + x.cout, 0), devis: dv.NumeroDocument || dv.NumeroDevis };
}

/** Données de la semaine (sans contrôle de rôle : utilisée aussi par le mail du lundi). */
function calculerSemaine(debut) {
  const lundi = lundiDe(debut);
  const fin = new Date(lundi.getTime() + 7 * 864e5);
  const affaires = lireLignes(NOMS_FEUILLES.AFFAIRES)
    .filter((a) => a.NumeroAffaire && a.Statut !== STATUTS_AFFAIRE.ABANDONNEE)
    .filter((a) => { const d = dateOuNull(a.DelaiPrevu); return d && d >= lundi && d < fin; });
  const numeros = affaires.map((a) => a.NumeroAffaire);
  const dans = (x) => numeros.indexOf(x.NumeroAffaire) !== -1;
  const frais = lireFrais().filter(dans);
  const devis = lireLignes(NOMS_FEUILLES.DEVIS).filter(dans);
  const lignesDevis = devis.length ? lireLignes(NOMS_FEUILLES.LIGNES_DEVIS) : [];
  const sorties = lireLignes(NOMS_FEUILLES.MOUVEMENTS_MATERIEL).filter(dans);
  const depenses = lireLignes(NOMS_FEUILLES.DEPENSES).filter(dans);
  const faite = testMissionFaite();
  const liees = frais.map((f) => f.NumeroDepense).filter(Boolean);
  const prises = lireLignes(NOMS_FEUILLES.MOUVEMENTS_VEHICULE).filter((m) => m.Action === ACTIONS_VEHICULE.PRISE && dateOuNull(m.Date));
  const notes = getClasseurDonnees().getSheetByName(NOMS_FEUILLES.JOURNAL)
    ? lireLignes(NOMS_FEUILLES.JOURNAL).filter((j) => dans(j) && j.Type === NOTE_COMPTA) : [];
  const iso = (d) => (dateOuNull(d) ? dateOuNull(d).toISOString() : '');

  const missions = affaires.map((a) => {
    const m = versMission(a);
    const jour = ymdUTC(dateOuNull(a.DelaiPrevu));
    const equipe = nomsAgents(a);
    const vehicules = prises.filter((p) => ymdUTC(dateOuNull(p.Date)) === jour && equipe.indexOf(String(p.Conducteur || '').trim().toLowerCase()) !== -1)
      .map((p) => p.Immatriculation).filter((x, i, t) => t.indexOf(x) === i);
    const acc = accessoiresProforma(a.NumeroAffaire, devis, lignesDevis);
    const conseil = { Transport: 0, Accessoires: acc.cout };
    const postes = [POSTES_FRAIS.TRANSPORT, POSTES_FRAIS.ACCESSOIRES].map((poste) => {
      const f = frais.filter((x) => x.NumeroAffaire === a.NumeroAffaire && x.Poste === poste)[0];
      const saisi = f && f.Montant !== '' && f.Montant != null;
      const paye = !!f && f.Statut === 'Payé';
      return {
        poste, montant: saisi ? Number(f.Montant) : conseil[poste], saisi, conseil: conseil[poste], paye,
        payeLe: paye ? iso(f.PayeLe) : '', payeA: paye ? String(f.PayeA || '') : '', montantPaye: paye ? Number(f.MontantPaye) || 0 : 0,
      };
    });
    return Object.assign(m, {
      jour, faite: faite(a) || STATUTS_CLOS.indexOf(a.Statut) !== -1,
      vehicules,
      accessoires: acc.lignes, devis: acc.devis,
      sortiesStock: sorties.filter((s) => s.NumeroAffaire === a.NumeroAffaire).map((s) => ({ materiel: s.Materiel, quantite: Number(s.QuantiteSortie) || 0 })),
      // Dépenses déjà notées sur l'affaire par quelqu'un d'autre (pour ne pas payer deux fois).
      depensesDeja: depenses.filter((d) => d.NumeroAffaire === a.NumeroAffaire && liees.indexOf(d.NumeroDepense) === -1).reduce((t, d) => t + (Number(d.Montant) || 0), 0),
      postes,
      notes: notes.filter((n) => n.NumeroAffaire === a.NumeroAffaire).map((n) => ({ date: iso(n.Date), par: n.Par, texte: n.Detail })).reverse(),
    });
  }).sort((x, y) => Date.parse(x.date) - Date.parse(y.date));

  const totaux = { prevu: 0, paye: 0, reste: 0, missions: missions.length, faites: missions.filter((m) => m.faite).length, urgences: 0 };
  missions.forEach((m) => m.postes.forEach((p) => {
    const prevu = p.paye ? p.montantPaye : p.montant;
    totaux.prevu += prevu;
    if (p.paye) totaux.paye += p.montantPaye; else totaux.reste += p.montant;
  }));
  totaux.urgencesSemaine = missions.filter((m) => m.urgence).length;
  // Urgences ouvertes qui n'ont pas encore de jour : de l'argent à prévoir bientôt.
  totaux.urgences = lireLignes(NOMS_FEUILLES.AFFAIRES)
    .filter((a) => a.NumeroAffaire && STATUTS_CLOS.indexOf(a.Statut) === -1 && a.Priorite === PRIORITES.ELEVEE).length;

  const jours = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lundi.getTime() + i * 864e5);
    const siennes = missions.filter((m) => m.jour === ymdUTC(d));
    if (siennes.length || i < 5) jours.push({ date: ymdUTC(d), libelle: texteJour(d), missions: siennes });
  }
  return { debut: ymdUTC(lundi), fin: ymdUTC(new Date(fin.getTime() - 864e5)), jours, totaux };
}

/** Écran « Semaine » (comptable, DG, DGA). debut : un jour de la semaine voulue (aaaa-mm-jj), cette semaine par défaut. */
function ecranSemaine(debut) {
  exigerRole(ROLES_SEMAINE);
  const s = calculerSemaine(debut);
  s.cetteSemaine = ymdUTC(lundiDe(new Date()));
  return s;
}

/** Résumé pour l'accueil du DG (et du DGA, de la comptable). */
function resumeSemaine() {
  const t = calculerSemaine().totaux;
  return { debut: ymdUTC(lundiDe(new Date())), missions: t.missions, faites: t.faites, urgences: t.urgences, prevu: t.prevu, paye: t.paye, reste: t.reste };
}

function ligneFrais(numeroAffaire, poste, creer) {
  const feuille = feuilleFrais();
  const valeurs = feuille.getDataRange().getValues();
  const e = valeurs[0];
  for (let i = 1; i < valeurs.length; i++) {
    if (valeurs[i][e.indexOf('NumeroAffaire')] === numeroAffaire && valeurs[i][e.indexOf('Poste')] === poste) {
      return { feuille, r: { index: i + 1, ligne: valeurs[i], entetes: e } };
    }
  }
  if (!creer) return null;
  feuille.appendRow([numeroAffaire, poste, '', 'Prévu', '', '', '', '', '', new Date()]);
  return ligneFrais(numeroAffaire, poste, false);
}

function verifierPoste(poste) {
  if ([POSTES_FRAIS.TRANSPORT, POSTES_FRAIS.ACCESSOIRES].indexOf(poste) === -1) throw new Error('Poste inconnu : ' + poste);
}

/** Montant prévu d'un poste, corrigé à la main. Vide = revenir au montant conseillé. */
function fixerFraisMission(numeroAffaire, poste, montant) {
  exigerRole(ROLES_SEMAINE);
  verifierPoste(poste);
  trouverAffaire(numeroAffaire);
  const vide = montant === '' || montant == null;
  if (!vide && !(Number(montant) >= 0)) throw new Error('Montant invalide : ' + montant);
  const x = ligneFrais(numeroAffaire, poste, true);
  if (x.r.ligne[x.r.entetes.indexOf('Statut')] === 'Payé') throw new Error('Déjà payé : annule le paiement pour changer le montant.');
  majCellule(x.feuille, x.r, 'Montant', vide ? '' : Math.round(Number(montant)));
  majCellule(x.feuille, x.r, 'DateMaj', new Date());
}

/**
 * « Payé » : p = {montant, a, date (aaaa-mm-jj)}. Enregistre le paiement sur la mission et une
 * dépense de l'affaire (Transport / carburant ou Matériel) pour le bénéfice.
 */
function payerFraisMission(numeroAffaire, poste, p) {
  const u = exigerRole(ROLES_SEMAINE);
  verifierPoste(poste);
  p = p || {};
  if (!(Number(p.montant) > 0)) throw new Error('Indique le montant payé.');
  const a = String(p.a || '').trim();
  if (!a) throw new Error('Indique à qui tu as payé.');
  const r = trouverAffaire(numeroAffaire);
  const affaire = ligneVersObjet(r.entetes, r.ligne);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || '')) ? new Date(p.date + 'T12:00:00Z') : new Date();
  const x = ligneFrais(numeroAffaire, poste, true);
  if (x.r.ligne[x.r.entetes.indexOf('Statut')] === 'Payé') throw new Error('Ce ' + poste.toLowerCase() + ' est déjà marqué payé.');
  const montant = Math.round(Number(p.montant));
  const dep = enregistrerDepense(numeroAffaire, CATEGORIE_POSTE[poste], montant,
    poste + ' payé à ' + a + ' · ' + affaire.Client + (affaire.Site ? ' · ' + affaire.Site : ''), date);
  [['Statut', 'Payé'], ['PayeLe', date], ['PayeA', a], ['MontantPaye', montant], ['PayePar', u.nom], ['NumeroDepense', dep], ['DateMaj', new Date()]]
    .forEach((c) => majCellule(x.feuille, x.r, c[0], c[1]));
  if (x.r.ligne[x.r.entetes.indexOf('Montant')] === '') majCellule(x.feuille, x.r, 'Montant', montant);
  noterJournal(numeroAffaire, TYPES_JOURNAL.NOTE, poste + ' payé : ' + montant.toLocaleString('fr-FR') + ' F à ' + a, u.nom);
  return dep;
}

/** Annule un paiement saisi par erreur : la dépense liée est retirée. */
function annulerPaiementFrais(numeroAffaire, poste) {
  const u = exigerRole(ROLES_SEMAINE);
  verifierPoste(poste);
  const x = ligneFrais(numeroAffaire, poste, false);
  if (!x || x.r.ligne[x.r.entetes.indexOf('Statut')] !== 'Payé') throw new Error('Rien à annuler.');
  const dep = x.r.ligne[x.r.entetes.indexOf('NumeroDepense')];
  if (dep) {
    const fd = getFeuilleDonnees(NOMS_FEUILLES.DEPENSES);
    const ld = trouverLigneParValeur(fd, 'NumeroDepense', dep);
    if (ld) fd.deleteRow(ld.index);
  }
  const montant = x.r.ligne[x.r.entetes.indexOf('MontantPaye')];
  [['Statut', 'Prévu'], ['PayeLe', ''], ['PayeA', ''], ['MontantPaye', ''], ['PayePar', ''], ['NumeroDepense', ''], ['DateMaj', new Date()]]
    .forEach((c) => majCellule(x.feuille, x.r, c[0], c[1]));
  noterJournal(numeroAffaire, TYPES_JOURNAL.NOTE, 'Paiement ' + poste.toLowerCase() + ' annulé (' + montant + ' F)', u.nom);
}

/** Note de la comptable sur une mission (gardée dans le Journal de l'affaire). */
function noterMissionCompta(numeroAffaire, texte) {
  const u = exigerRole(ROLES_SEMAINE);
  texte = String(texte || '').trim();
  if (!texte) throw new Error('La note est vide.');
  trouverAffaire(numeroAffaire);
  noterJournal(numeroAffaire, NOTE_COMPTA, texte.slice(0, 1000), u.nom);
}

// ---------- Mail du lundi matin ----------

function texteResumeSemaine(s) {
  const t = s.totaux;
  const f = (n) => Math.round(n).toLocaleString('fr-FR') + ' F';
  const lignes = [];
  s.jours.forEach((j) => {
    if (!j.missions.length) return;
    lignes.push('\n' + j.libelle.toUpperCase());
    j.missions.forEach((m) => {
      const aPayer = m.postes.filter((p) => !p.paye && p.montant > 0).map((p) => p.poste.toLowerCase() + ' ' + f(p.montant));
      lignes.push('- ' + (m.heure ? m.heure + ' · ' : '') + (m.urgence ? 'URGENCE · ' : '') + m.client + (m.site ? ' · ' + m.site : '') + ' : ' + m.titre
        + (m.equipe ? ' (' + m.equipe + ')' : '') + (aPayer.length ? '\n    À payer : ' + aPayer.join(', ') : ''));
    });
  });
  return 'Bonjour,\n\nVoici le programme de la semaine du ' + s.debut.split('-').reverse().join('/') + '.\n\n'
    + t.missions + ' intervention(s) programmée(s)' + (t.urgencesSemaine ? ', dont ' + t.urgencesSemaine + ' urgence(s)' : '') + '.\n'
    + t.urgences + ' urgence(s) ouverte(s) au total.\n'
    + 'Sorties d\'argent prévues : ' + f(t.prevu) + ' · déjà payé : ' + f(t.paye) + ' · reste à payer : ' + f(t.reste) + '.\n'
    + (lignes.length ? lignes.join('\n') + '\n' : '\nAucune intervention programmée pour le moment.\n')
    + '\nLe détail est dans l\'application, écran « Semaine ».\n\nMaison Symbiose';
}

/** Lancée avec les alertes de 7 h : le lundi, résumé de la semaine au DG et à la comptable (une fois). */
function envoyerResumeSemaineSiLundi(maintenant) {
  maintenant = maintenant || new Date();
  if (maintenant.getUTCDay() !== 1) return null;
  const cle = ymdUTC(lundiDe(maintenant));
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('RESUME_SEMAINE') === cle) return null;
  props.setProperty('RESUME_SEMAINE', cle);
  const s = calculerSemaine(maintenant);
  alerterRoles([ROLES.DG, ROLES.COMPTABILITE], 'Programme de la semaine : ' + s.totaux.missions + ' intervention(s), ' + Math.round(s.totaux.reste).toLocaleString('fr-FR') + ' F à prévoir', texteResumeSemaine(s));
  return s.totaux;
}
