# Petit Dressing v0.5 — accessoires et icônes

## Nouveautés

- nouvelle section **Accessoires**, valable pour tous les âges ;
- catégories intégrées : bavoirs, bavettes, tétras / langes coton et capes de bain ;
- détection des accessoires déjà encodés dans les tailles ;
- migration proposée sans perte de quantité, avec résumé avant validation ;
- bibliothèque d’icônes pour les articles personnalisés ;
- suggestion automatique d’icône selon le nom saisi ;
- synchronisation de la migration et des nouvelles icônes entre les téléphones.

## Installation de la mise à jour

1. Décompresser l’archive dans le dossier principal du projet.
2. Accepter la fusion des dossiers et le remplacement des fichiers.
3. Envoyer la mise à jour sur GitHub :

```powershell
git add .
git commit -m "Ajoute les accessoires et la bibliothèque d'icônes"
git push
```

Aucune nouvelle dépendance n’est ajoutée. Cloudflare reconstruira automatiquement l’application avec la configuration déjà en place.

## Première ouverture après la mise à jour

Si Petit Dressing retrouve des bavoirs, bavettes, tétras, langes ou capes de bain dans les tailles, une fenêtre affiche les quantités détectées.

- **Déplacer automatiquement** additionne les quantités dans Accessoires et retire les anciennes lignes des tailles.
- **Plus tard** conserve tout en place. La proposition reste accessible dans Réglages.

La migration est synchronisée avec le dressing familial et ne s’exécute qu’une seule fois pour chaque article retrouvé.
