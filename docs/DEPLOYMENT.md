# Déployer cr.io

La version `0.1.0` est une application statique servie par Nginx. Elle ne nécessite ni Node.js à l'exécution, ni base de données.

## Configuration initiale

1. Créer un dépôt GitHub nommé `crio` et y pousser ce dossier sur la branche `main`.
2. Dans Koyeb, créer une App `crio` et un Web Service `web` depuis le dépôt GitHub.
3. Choisir le builder `Dockerfile`, exposer le port HTTP `8000` sur la route `/`, et utiliser `/health` comme health check HTTP.
4. Après le premier déploiement, désactiver l'Autodeploy Koyeb : les déploiements suivants seront déclenchés par GitHub Actions uniquement après les contrôles.
5. Créer un token API Koyeb et l'ajouter au dépôt comme secret Actions `KOYEB_TOKEN`.
6. Ajouter les variables Actions suivantes : `KOYEB_APP=crio`, `KOYEB_SERVICE=web`, `PRODUCTION_URL=https://…koyeb.app`.
7. Protéger `main` avec une Pull Request et le status check `verify` recommandé.

## Fonctionnement ensuite

Chaque Pull Request construit et teste l'image. Chaque merge dans `main` vérifie à nouveau l'image, redéploie Koyeb, attend la fin du déploiement puis vérifie `/health`.

## Future API et PostgreSQL

Quand le backend sera ajouté, insérer un job `migrate` entre `verify` et `deploy`, avec `DATABASE_URL` comme secret. Les migrations devront être versionnées, explicites et rétrocompatibles. Le endpoint `/health` devra alors contrôler l'API et PostgreSQL avant de répondre `200`.
