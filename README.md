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
- installation PWA, interface mobile et shell disponible hors connexion ;
- isolation des données prévue par workspace.

## État

Version `0.7.2` : application installable sur mobile et ordinateur, shell hors connexion sans mise en cache des données de laboratoire, migrations Drizzle vérifiées, image Docker publiée automatiquement et déploiements Render gratuit ou Docker Compose prêts à l’emploi. GitHub Pages reste la vitrine statique avec données de démonstration.

- [Déployer gratuitement sur Render](https://render.com/deploy?repo=https://github.com/cedricpdp/cr.io)
- Documentation : [`hébergement gratuit`](docs/FREE-HOSTING.md), [`déploiement Docker`](docs/DEPLOYMENT.md) et [`API`](docs/API.md).
