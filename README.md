# cr.io

Application web de gestion visuelle du stockage d'échantillons scientifiques.

## Socle technique

- React, TypeScript et Vite pour l'interface ;
- Fastify et Zod pour l'API ;
- PostgreSQL et Drizzle ORM pour les données ;
- pnpm 11 et Node.js 24 ;
- un conteneur unique sert l'API et l'application compilée.

## Démarrage local

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Ouvrir `http://localhost:5173`. En l'absence de PostgreSQL, l'API fonctionne avec les données de démonstration et le health check indique `database: not_configured`.

## Commandes utiles

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:migrate
```

## Principes produit conservés

- navigation adaptative : les niveaux freezer et rack uniques sont sautés ;
- une box reste toujours un choix explicite ;
- thème système, clair ou sombre avec préférence locale ;
- recherche globale et grille de positions responsive ;
- isolation des données prévue par workspace.

## État

Version `0.5.0` : gestion complète des échantillons — création, modification, déplacement atomique et suppression — en plus du CRUD freezer/rack/box et de l’authentification. Les positions et identifiants sont uniques par périmètre, toutes les opérations sont isolées par workspace. GitHub Pages reste la vitrine statique avec données de démonstration ; le Dockerfile est la cible de déploiement full-stack. Voir [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) et [`docs/API.md`](docs/API.md).
