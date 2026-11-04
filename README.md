# Maison Symbiose

Logiciel de gestion interne de Symbiose : demandes, devis (coûts/écarts/marge),
facturation/paiement, stock (outillage + matériel de travaux).

Cahier des charges complet : https://claude.ai/artifact/EDZDqJNBmGUYdNLLcrN7AP

Projet séparé du GMAO (GesPatrimo) : aucun pont technique entre les deux.

## Développement

Le code vit dans `src/` et est synchronisé avec un projet Google Apps Script
via [clasp](https://github.com/google/clasp), suivant le même principe que
le dépôt `sygstation-erp` (voir son `docs/IMPORT_CLASP.md`).

- `.clasp.json` (à la racine) contient l'ID du script Apps Script et n'est
  **jamais commité** (voir `.gitignore`) : chaque environnement de travail le
  régénère avec `clasp create`/`clasp clone` ou le récupère localement.
- L'authentification Google de clasp (`~/.clasprc.json`) se fait une fois par
  environnement avec `clasp login` (ou `clasp login --no-localhost` dans un
  environnement sans navigateur), avec le compte `michelgabinmbra@gmail.com`.
- Pour synchroniser après une modification du code : `clasp push`.
- Aucun déploiement (web app) n'est fait sans validation explicite de Michel.

Une seule base de données : un classeur Google Sheets créé par
`initialiserBaseDeDonnees()` (à exécuter une fois depuis l'éditeur Apps
Script), dont l'ID est stocké dans les propriétés du script — jamais codé en
dur.

## Rôles

Voir `src/00_Config.js` (`ROLES`) et le cahier des charges, section "Rôles et
accès" : DG, DGA, Technicien, Comptabilité, Stock (Jean). Les comptes et leurs
rôles sont enregistrés dans la feuille `Utilisateurs` du classeur de données,
pas dans le code.
