# Petit Dressing v0.4 — synchronisation familiale

## Nouveautés

- synchronisation automatique entre plusieurs téléphones ;
- création d’un dressing partagé avec un code privé ;
- fonctionnement hors ligne : les modifications sont mises en attente puis envoyées au retour du réseau ;
- synchronisation par petites opérations pour éviter qu’une modification simultanée écrase l’autre ;
- stockage Cloudflare D1, lié au Worker existant ;
- conservation de la sauvegarde locale et de l’export/import JSON.

## Installation de la mise à jour

1. Arrêter le serveur local avec `Ctrl + C`.
2. Copier tous les fichiers de l’archive dans le dossier principal du projet.
3. Accepter le remplacement et la fusion des dossiers.
4. Supprimer l’ancien fichier `public/_redirects` s’il existe encore.
5. Installer la nouvelle dépendance :

```powershell
npm install
```

6. Vérifier le projet :

```powershell
npm run build
```

7. Envoyer la mise à jour :

```powershell
git add .
git commit -m "Ajout de la synchronisation familiale"
git push
```

Cloudflare relancera le déploiement. Wrangler 4.112 provisionnera automatiquement la base D1 liée à la variable `DB` lors du premier déploiement.

## Première utilisation

Sur le téléphone principal :

1. Ouvrir **Réglages**.
2. Choisir **Créer le dressing partagé**.
3. Copier le code affiché et l’envoyer à la seconde personne.

Sur le second téléphone :

1. Ouvrir ou installer Petit Dressing.
2. Ouvrir **Réglages**.
3. Choisir **Rejoindre avec un code**.
4. Coller le code.

Le code agit comme une clé d’accès. Il ne doit être communiqué qu’aux personnes autorisées à modifier le dressing.
