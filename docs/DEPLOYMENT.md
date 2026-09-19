# Déployer cr.io

## Vitrine GitHub Pages

Le workflow `deploy.yml` compile React et publie `dist/web` après chaque push sur `main`. Cette version utilise les données de démonstration lorsque l’API n’est pas disponible.

## Image full-stack automatisée

Chaque push sur `main` publie aussi deux tags sur GitHub Container Registry :

- `ghcr.io/cedricpdp/cr.io:latest` ;
- `ghcr.io/cedricpdp/cr.io:sha-<commit>` pour un déploiement reproductible.

L’image sert l’API et l’application sur le port `8000`. Au démarrage, elle applique les migrations Drizzle si `DATABASE_URL` est définie, puis lance Fastify. Le contrôle de vie est `GET /api/live` ; `GET /api/health` vérifie également PostgreSQL.

Après la première publication, rendre le package `cr.io` public une seule fois dans les réglages GitHub Packages afin que le serveur puisse le télécharger sans identifiants. Tant que ce réglage n’est pas fait, utiliser `docker compose --env-file .env.production up -d --build` pour construire localement depuis le dépôt.

## Premier démarrage avec Docker Compose

Sur un serveur équipé de Docker et du plugin Compose :

```bash
git clone https://github.com/cedricpdp/cr.io.git
cd cr.io
cp .env.production.example .env.production
```

Générer un secret aléatoire composé de caractères hexadécimaux, puis remplacer la valeur de `POSTGRES_PASSWORD` :

```bash
openssl rand -hex 32
```

Démarrer PostgreSQL et cr.io :

```bash
docker compose --env-file .env.production pull
docker compose --env-file .env.production up -d
docker compose --env-file .env.production ps
```

L’application répond alors sur `http://<serveur>:8000`. Le volume `crio_database` conserve la base entre les mises à jour.

## Mise à jour

```bash
git pull --ff-only
docker compose --env-file .env.production pull
docker compose --env-file .env.production up -d
```

Les migrations sont rejouables sans danger et s’exécutent avant l’ouverture du serveur HTTP.

## Production publique

Placer un reverse proxy HTTPS devant le port `8000` et ne pas publier le port PostgreSQL. Sauvegarder régulièrement le volume de base. Pour revenir précisément à une version, définir `CRIO_IMAGE` avec un tag `sha-<commit>` dans `.env.production`.

Variables prises en charge par Compose :

| Variable | Requise | Rôle |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | oui | Mot de passe interne de PostgreSQL ; utiliser une valeur hexadécimale longue |
| `CRIO_PORT` | non | Port public, `8000` par défaut |
| `CRIO_IMAGE` | non | Image à déployer, `ghcr.io/cedricpdp/cr.io:latest` par défaut |

## PWA et hors connexion

L’installation PWA nécessite HTTPS, sauf sur `localhost`. Le service worker met uniquement en cache le shell statique. Les routes `/api/*` et les données de laboratoire ne sont jamais placées dans son cache. Sans réseau au premier chargement, cr.io affiche donc un écran explicite au lieu de données de démonstration.
