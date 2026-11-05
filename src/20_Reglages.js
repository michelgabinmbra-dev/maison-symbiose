/**
 * Réglages depuis le téléphone, sans ouvrir le classeur : équipe (rôle, droits, fonction, code
 * d'accès), clients (contacts, code document, point du vendredi), sites, véhicules, stock
 * (matériel avec seuil d'alerte, outils). Le DG et le DGA voient tout ; Jean (STOCK) ne voit que
 * le stock.
 */

const ROLES_REGLAGES = [ROLES.DG, ROLES.DGA];

function ecranReglages() {
  const utilisateur = exigerRole(ROLES_REGLAGES.concat([ROLES.STOCK]));
  const tout = ROLES_REGLAGES.indexOf(utilisateur.role) !== -1;
  const ymd = (d) => (dateOuNull(d) ? Utilities.formatDate(dateOuNull(d), 'Africa/Abidjan', 'yyyy-MM-dd') : '');
  const stock = {
    materiel: lireLignes(NOMS_FEUILLES.STOCK_MATERIEL).filter((m) => m.Materiel)
      .map((m) => ({ materiel: m.Materiel, quantite: Number(m.Quantite) || 0, prix: Number(m.PrixUnitaire) || 0, seuil: Number(m.SeuilAlerte) || 0 })),
    outils: lireLignes(NOMS_FEUILLES.STOCK_OUTILLAGE).filter((o) => o.Outil)
      .map((o) => ({ outil: o.Outil, lieu: o.Lieu || '', statut: o.Statut })),
  };
  if (!tout) return { tout, stock };
  return {
    tout,
    stock,
    roles: Object.values(ROLES),
    droits: Object.values(DROITS),
    equipe: lireLignes(NOMS_FEUILLES.UTILISATEURS).filter((u) => u.Email).map((u) => ({
      email: u.Email, nom: u.Nom, role: u.Role, actif: u.Actif !== false, droits: String(u.Droits || ''),
      fonction: u.Fonction || '', telephone: String(u.Telephone || ''), aUnCode: !!u.CodeAcces,
    })),
    clients: lireLignes(NOMS_FEUILLES.CLIENTS).filter((c) => c.NomClient).map((c) => ({
      nom: c.NomClient, contrat: c.TypeContrat || '', contacts: c.ContactEmail || '', code: c.CodeDocument || '',
      pointHebdo: c.PointHebdo === true || String(c.PointHebdo).toLowerCase() === 'oui',
    })),
    sites: lireLignes(NOMS_FEUILLES.SITES).filter((s) => s.NomSite).map((s) => ({ nom: s.NomSite, client: s.NomClient, ville: s.Ville || '' })),
    vehicules: lireLignes(NOMS_FEUILLES.VEHICULES).filter((v) => v.Immatriculation).map((v) => ({
      immatriculation: v.Immatriculation, marque: v.Marque || '', modele: v.Modele || '',
      visiteTechnique: ymd(v.DateVisiteTechnique), assurance: ymd(v.DateAssurance),
    })),
  };
}

/** Écrit les champs d'un objet dans une ligne (créée si absente), colonne par colonne. */
function ecrireLigne(nomFeuille, colonneCle, valeurCle, champs) {
  const feuille = getFeuilleDonnees(nomFeuille);
  let resultat = trouverLigneParValeur(feuille, colonneCle, valeurCle);
  if (!resultat) {
    const entetes = feuille.getRange(1, 1, 1, feuille.getLastColumn()).getValues()[0];
    const ligne = entetes.map((e) => (e === colonneCle ? valeurCle : (champs[e] !== undefined ? champs[e] : '')));
    feuille.appendRow(ligne);
    return 'ajout';
  }
  Object.keys(champs).forEach((col) => {
    if (resultat.entetes.indexOf(col) !== -1) majCellule(feuille, resultat, col, champs[col]);
  });
  return 'mise à jour';
}

/** Ajoute ou modifie une personne de l'équipe ; code (4 à 6 chiffres) facultatif. */
function enregistrerMembre(m) {
  const moi = exigerRole(ROLES_REGLAGES);
  const email = String(m && m.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Adresse mail invalide.');
  if (Object.values(ROLES).indexOf(m.role) === -1) throw new Error('Rôle invalide : ' + m.role);
  const droits = String(m.droits || '').split(/[,;]+/).map((d) => d.trim()).filter((d) => Object.values(DROITS).indexOf(d) !== -1);
  const existant = trouverLigneParValeur(getFeuilleDonnees(NOMS_FEUILLES.UTILISATEURS), 'Email', email);
  const emailCle = existant ? existant.ligne[existant.entetes.indexOf('Email')] : email;
  const roleActuel = existant ? existant.ligne[existant.entetes.indexOf('Role')] : '';
  if (moi.role !== ROLES.DG && (m.role === ROLES.DG || roleActuel === ROLES.DG)) {
    throw new Error('Seul le DG peut créer ou modifier un compte DG.');
  }
  const resultat = ecrireLigne(NOMS_FEUILLES.UTILISATEURS, 'Email', emailCle, {
    Nom: String(m.nom || '').trim(), Role: m.role, Actif: m.actif !== false, Droits: droits.join(', '),
    Fonction: String(m.fonction || '').trim(), Telephone: String(m.telephone || '').trim(),
  });
  if (m.code) definirCodeAcces(emailCle, String(m.code));
  return resultat;
}

function enregistrerClientReglages(c) {
  exigerRole(ROLES_REGLAGES);
  const nom = String(c && c.nom || '').trim();
  if (!nom) throw new Error('Le nom du client est obligatoire.');
  return ecrireLigne(NOMS_FEUILLES.CLIENTS, 'NomClient', nom, {
    TypeContrat: String(c.contrat || ''), ContactEmail: String(c.contacts || '').replace(/[;\s]+/g, ',').replace(/,+/g, ',').replace(/^,|,$/g, ''),
    CodeDocument: String(c.code || '').toUpperCase(), PointHebdo: c.pointHebdo ? 'Oui' : 'Non',
  });
}

/** Ajoute plusieurs sites d'un coup : une ligne par site, « Nom du site ; Ville » (ville facultative). */
function ajouterSites(client, texte) {
  exigerRole(ROLES_REGLAGES);
  if (!client) throw new Error('Choisis le client.');
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.SITES);
  const existants = lireLignes(NOMS_FEUILLES.SITES).filter((s) => s.NomClient === client).map((s) => String(s.NomSite).toLowerCase());
  let ajoutes = 0;
  String(texte || '').split(/\n+/).forEach((ligne) => {
    const morceaux = ligne.split(/[;\t]/).map((x) => x.trim());
    const nom = morceaux[0];
    if (!nom || existants.indexOf(nom.toLowerCase()) !== -1) return;
    feuille.appendRow([nom, client, morceaux[1] || '']);
    existants.push(nom.toLowerCase());
    ajoutes++;
  });
  return ajoutes;
}

function supprimerSite(client, nom) {
  exigerRole(ROLES_REGLAGES);
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.SITES);
  const valeurs = feuille.getDataRange().getValues();
  const cNom = valeurs[0].indexOf('NomSite');
  const cClient = valeurs[0].indexOf('NomClient');
  for (let i = valeurs.length - 1; i >= 1; i--) {
    if (valeurs[i][cNom] === nom && valeurs[i][cClient] === client) {
      feuille.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

function enregistrerVehiculeReglages(v) {
  exigerRole(ROLES_REGLAGES.concat([ROLES.VEHICULES]));
  const imm = String(v && v.immatriculation || '').trim().toUpperCase();
  if (!imm) throw new Error("L'immatriculation est obligatoire.");
  return ecrireLigne(NOMS_FEUILLES.VEHICULES, 'Immatriculation', imm, { Marque: String(v.marque || ''), Modele: String(v.modele || '') });
}

/** Ajoute du matériel au stock (entrée) et/ou règle son seuil d'alerte. */
function enregistrerMaterielReglages(m) {
  exigerRole(ROLES_GESTION_STOCK);
  const nom = String(m && m.materiel || '').trim();
  if (!nom) throw new Error('Le nom du matériel est obligatoire.');
  if (Number(m.entree) > 0) entrerMateriel(nom, Number(m.entree), m.prix === '' || m.prix == null ? null : Number(m.prix));
  else if (!trouverLigneParValeur(getFeuilleDonnees(NOMS_FEUILLES.STOCK_MATERIEL), 'Materiel', nom)) {
    getFeuilleDonnees(NOMS_FEUILLES.STOCK_MATERIEL).appendRow([nom, 0, Number(m.prix) || 0]);
  }
  if (m.seuil !== undefined && m.seuil !== '') {
    const feuille = getFeuilleDonnees(NOMS_FEUILLES.STOCK_MATERIEL);
    majCellule(feuille, trouverLigneParValeur(feuille, 'Materiel', nom), 'SeuilAlerte', Number(m.seuil) || 0);
  }
}
