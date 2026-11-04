/** Petits utilitaires partagés pour lire/écrire dans les feuilles de données. */

/** Génère un numéro séquentiel du type "PREFIXE-2026-0007" à partir des numéros déjà présents dans la colonne. */
function genererNumero(prefixe, feuille, nomColonneNumero) {
  const annee = new Date().getFullYear();
  const entetes = feuille.getDataRange().getValues()[0];
  const colonne = entetes.indexOf(nomColonneNumero);
  const valeurs = feuille.getDataRange().getValues();
  let max = 0;
  const motif = new RegExp('^' + prefixe + '-' + annee + '-(\\d+)$');
  for (let i = 1; i < valeurs.length; i++) {
    const correspondance = motif.exec(String(valeurs[i][colonne]));
    if (correspondance) {
      max = Math.max(max, parseInt(correspondance[1], 10));
    }
  }
  const suivant = String(max + 1).padStart(4, '0');
  return prefixe + '-' + annee + '-' + suivant;
}

/** Renvoie {index, ligne, entetes} de la première ligne dont la colonne `nomColonne` vaut `valeur`, ou null. */
function trouverLigneParValeur(feuille, nomColonne, valeur) {
  const toutesLesValeurs = feuille.getDataRange().getValues();
  const entetes = toutesLesValeurs[0];
  const colonne = entetes.indexOf(nomColonne);
  if (colonne === -1) {
    throw new Error("Colonne introuvable : " + nomColonne);
  }
  for (let i = 1; i < toutesLesValeurs.length; i++) {
    if (String(toutesLesValeurs[i][colonne]) === String(valeur)) {
      return { index: i + 1, ligne: toutesLesValeurs[i], entetes: entetes };
    }
  }
  return null;
}

/** Met à jour une cellule (par nom de colonne) sur la ligne feuille trouvée par trouverLigneParValeur. */
function majCellule(feuille, resultatLigne, nomColonne, valeur) {
  const colonne = resultatLigne.entetes.indexOf(nomColonne);
  if (colonne === -1) {
    throw new Error("Colonne introuvable : " + nomColonne);
  }
  feuille.getRange(resultatLigne.index, colonne + 1).setValue(valeur);
}
