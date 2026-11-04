/** Clients et sites/agences (ex. AFG + ses agences, UCP-FM + ses 5 branches, PNLP...). */

function creerClient(nomClient, typeContrat, contactEmail) {
  exigerRole([ROLES.DG, ROLES.DGA]);
  if (!nomClient) {
    throw new Error('Le nom du client est obligatoire.');
  }
  getFeuilleDonnees(NOMS_FEUILLES.CLIENTS).appendRow([nomClient, typeContrat || '', contactEmail || '']);
}

function creerSite(nomSite, nomClient, ville) {
  exigerRole([ROLES.DG, ROLES.DGA]);
  if (!nomSite || !nomClient) {
    throw new Error('Le nom du site et le nom du client sont obligatoires.');
  }
  getFeuilleDonnees(NOMS_FEUILLES.SITES).appendRow([nomSite, nomClient, ville || '']);
}

function listerSitesDunClient(nomClient) {
  const feuille = getFeuilleDonnees(NOMS_FEUILLES.SITES);
  const valeurs = feuille.getDataRange().getValues();
  const entetes = valeurs[0];
  const colClient = entetes.indexOf('NomClient');
  return valeurs.slice(1)
    .filter((ligne) => ligne[colClient] === nomClient)
    .map((ligne) => ligneVersObjet(entetes, ligne));
}
