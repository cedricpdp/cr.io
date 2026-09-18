# Déployer cr.io

## Vitrine GitHub Pages

Le workflow `deploy.yml` compile React et publie `dist/web` après chaque push sur `main`. Cette version utilise automatiquement les données de démonstration lorsque l'API n'est pas disponible.

## Application full-stack

Le `Dockerfile` produit un service Node.js unique sur le port `8000` : Fastify expose `/api/*` et sert l'application React compilée. Le health check est `GET /api/health`.

Variables d'environnement :

| Variable | Requise | Rôle |
| --- | --- | --- |
| `PORT` | non | Port HTTP, `8000` dans l'image |
| `DATABASE_URL` | en production | Connexion PostgreSQL |

Avant un déploiement full-stack :

1. créer une base PostgreSQL et définir `DATABASE_URL` ;
2. exécuter `pnpm db:migrate` avec cette variable ;
3. construire et démarrer l'image ;
4. vérifier `/api/health`, puis `/` ;
5. protéger `main` avec le job GitHub Actions `verify`.

Le fournisseur d'hébergement sera choisi avant la mise en production de l'authentification. Il doit accepter une image Docker, des variables secrètes et une connexion PostgreSQL TLS.
