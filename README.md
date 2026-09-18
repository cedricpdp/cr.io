# cr.io

Prototype public de gestion visuelle du stockage scientifique.

## Essai local sans Node.js

Ouvrir directement `index.html`, ou lancer :

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.

## Production

L'image Docker sert l'application sur le port `8000` et expose `GET /health`. Voir [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Principes déjà démontrés

- navigation adaptative : un freezer et un rack uniques sont sautés ;
- une box reste toujours un choix explicite ;
- thème système, clair ou sombre avec préférence locale ;
- recherche globale accessible depuis chaque écran ;
- grille lisible avec états vide, occupé et sélectionné non fondés uniquement sur la couleur ;
- interface responsive sans build ni dépendance JavaScript.

## État

Version `0.1.0` : prototype front-end statique avec données de démonstration. L'authentification, l'API et PostgreSQL viendront dans une version ultérieure.
