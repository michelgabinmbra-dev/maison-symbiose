/**
 * Réglages depuis le téléphone, sans ouvrir le classeur : équipe (rôle, droits, fonction, code
 * d'accès), clients (contacts, code document, point du vendredi), sites, véhicules, stock
 * (matériel avec seuil d'alerte, outils). Le DG et le DGA voient tout ; Jean (STOCK) ne voit que
 * le stock ; Arnaud et Barbara (VEHICULES) les véhicules ; Marina et Armand (droit Planning) les sites.
 */

const ROLES_REGLAGES = [ROLES.DG, ROLES.DGA];

/** Onglets de Réglages ouverts à cette personne : tout pour DG / DGA, sinon selon son rôle et ses droits. */
function ongletsReglages(u) {
  if (ROLES_REGLAGES.indexOf(u.role) !== -1) return ['equipe', 'clients', 'sites', 'vehicules', 'stock'];
  const o = [];
  if (aLeDroit(u, DROITS.PLANNING)) o.push('sites');
  if (u.role === ROLES.VEHICULES) o.push('vehicules');
  if (u.role === ROLES.STOCK) o.push('stock');
  return o;
}

function ecranReglages() {
  const utilisateur = exigerRole(Object.values(ROLES));
  const onglets = ongletsReglages(utilisateur);
  if (!onglets.length) throw new Error('Accès refusé : pas de réglages pour ton rôle.');
  const tout = onglets.indexOf('equipe') !== -1;
  const ymd = (d) => (dateOuNull(d) ? Utilities.formatDate(dateOuNull(d), 'Africa/Abidjan', 'yyyy-MM-dd') : '');
  const d = { tout, onglets };
  if (onglets.indexOf('stock') !== -1) {
    d.stock = {
      materiel: lireLignes(NOMS_FEUILLES.STOCK_MATERIEL).filter((m) => m.Materiel)
        .map((m) => ({ materiel: m.Materiel, quantite: Number(m.Quantite) || 0, prix: Number(m.PrixUnitaire) || 0, seuil: Number(m.SeuilAlerte) || 0 })),
      outils: lireLignes(NOMS_FEUILLES.STOCK_OUTILLAGE).filter((o) => o.Outil)
        .map((o) => ({ outil: o.Outil, lieu: o.Lieu || '', statut: o.Statut, photo: o.Photo || '' })),
    };
  }
  if (onglets.indexOf('vehicules') !== -1) {
    d.vehicules = lireLignes(NOMS_FEUILLES.VEHICULES).filter((v) => v.Immatriculation).map((v) => ({
      immatriculation: v.Immatriculation, marque: v.Marque || '', modele: v.Modele || '',
      visiteTechnique: ymd(v.DateVisiteTechnique), assurance: ymd(v.DateAssurance),
      kmProchaineVidange: Number(v.KmProchaineVidange) || '', documents: documentsVehicule(v),
    }));
  }
  if (onglets.indexOf('sites') !== -1) {
    const clients = lireLignes(NOMS_FEUILLES.CLIENTS).filter((c) => c.NomClient);
    // Hors DG / DGA, seul le nom du client est transmis (pas les contacts).
    d.clients = clients.map((c) => (tout ? {
      nom: c.NomClient, contrat: c.TypeContrat || '', contacts: c.ContactEmail || '', code: c.CodeDocument || '',
      pointHebdo: c.PointHebdo === true || String(c.PointHebdo).toLowerCase() === 'oui',
    } : { nom: c.NomClient }));
    d.sites = lireLignes(NOMS_FEUILLES.SITES).filter((x) => x.NomSite).map((x) => ({ nom: x.NomSite, client: x.NomClient, ville: x.Ville || '' }));
  }
  if (tout) {
    d.roles = Object.values(ROLES);
    d.droits = Object.values(DROITS);
    d.equipe = lireLignes(NOMS_FEUILLES.UTILISATEURS).filter((u) => u.Email).map((u) => ({
      email: u.Email, nom: u.Nom, role: u.Role, actif: u.Actif !== false, droits: String(u.Droits || ''),
      fonction: u.Fonction || '', telephone: String(u.Telephone || ''), aUnCode: !!u.CodeAcces,
    }));
  }
  return d;
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
    Fonction: String(m.fonction || '').trim(), Telephone: m.telephone ? "'" + String(m.telephone).trim() : '',
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
  exigerRoleOuDroit(ROLES_REGLAGES, DROITS.PLANNING);
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
  exigerRoleOuDroit(ROLES_REGLAGES, DROITS.PLANNING);
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
  const champs = { Marque: String(v.marque || ''), Modele: String(v.modele || '') };
  // Échéances et documents saisis en même temps que le véhicule (demande de Michel du 06/11).
  if (v.visiteTechnique) champs.DateVisiteTechnique = new Date(v.visiteTechnique);
  if (v.assurance) champs.DateAssurance = new Date(v.assurance);
  if (Number(v.kmProchaineVidange) > 0) champs.KmProchaineVidange = Number(v.kmProchaineVidange);
  const nouveaux = {};
  Object.keys(DOCUMENTS_VEHICULE).forEach((k) => {
    if (v.documents && v.documents[k]) nouveaux[k] = enregistrerImageDrive(v.documents[k], imm + ' - ' + DOCUMENTS_VEHICULE[k] + '.jpg');
  });
  if (Object.keys(nouveaux).length) {
    const existant = trouverLigneParValeur(getFeuilleDonnees(NOMS_FEUILLES.VEHICULES), 'Immatriculation', imm);
    champs.Documents = JSON.stringify(Object.assign(existant ? documentsVehicule(ligneVersObjet(existant.entetes, existant.ligne)) : {}, nouveaux));
  }
  return ecrireLigne(NOMS_FEUILLES.VEHICULES, 'Immatriculation', imm, champs);
}

const DOCUMENTS_VEHICULE = { carteGrise: 'Carte grise', assurance: 'Assurance', visiteTechnique: 'Visite technique' };

/** {carteGrise: idDrive, assurance: idDrive, visiteTechnique: idDrive} (ceux qui existent). */
function documentsVehicule(v) {
  try { return JSON.parse(v.Documents || '{}'); } catch (e) { return {}; }
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
