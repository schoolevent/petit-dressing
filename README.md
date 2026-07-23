# Petit Dressing v0.6 — lien de consultation

## Nouveautés

- création d’un **lien en lecture seule** depuis les réglages ;
- aucune modification possible depuis ce lien ;
- choix d’afficher ou de masquer le prénom du bébé ;
- actualisation automatique des données partagées ;
- possibilité de régénérer ou désactiver le lien à tout moment ;
- le code familial de modification n’apparaît jamais dans le lien public.

## Installation

Copier le contenu de cette mise à jour dans le dossier principal du projet, puis :

```powershell
git add .
git commit -m "Ajoute le lien de consultation"
git push
```

Cloudflare crée automatiquement la nouvelle table D1 au premier appel. Aucune commande de migration manuelle n’est nécessaire.

## Utilisation

Dans **Réglages → Lien de consultation** :

1. choisir si le prénom du bébé doit apparaître ;
2. créer le lien ;
3. copier et partager ce lien ;
4. le régénérer ou le désactiver si nécessaire.
