# API cr.io

Toutes les routes métier exigent le cookie de session `crio_session`. Le workspace n'est jamais fourni par le client : il est résolu depuis la session afin d'empêcher les accès croisés.

| Méthode | Route | Fonction |
| --- | --- | --- |
| `GET` | `/api/storage` | Hiérarchie complète du workspace |
| `GET` | `/api/search?q=…&limit=…` | Rechercher des échantillons, maximum 50 résultats |
| `GET` | `/api/export/samples.csv` | Exporter les échantillons du workspace |
| `POST` | `/api/freezers` | Créer un freezer |
| `PATCH` | `/api/freezers/:id` | Modifier un freezer |
| `DELETE` | `/api/freezers/:id` | Supprimer un freezer et son contenu |
| `POST` | `/api/freezers/:freezerId/racks` | Créer un rack |
| `PATCH` | `/api/racks/:id` | Modifier un rack |
| `DELETE` | `/api/racks/:id` | Supprimer un rack et son contenu |
| `POST` | `/api/racks/:rackId/boxes` | Créer une box |
| `PATCH` | `/api/boxes/:id` | Modifier une box |
| `DELETE` | `/api/boxes/:id` | Supprimer une box et son contenu |
| `POST` | `/api/boxes/:boxId/samples` | Créer un échantillon à une position |
| `PATCH` | `/api/samples/:id` | Modifier les informations d’un échantillon |
| `POST` | `/api/samples/:id/move` | Déplacer un échantillon vers une box et une position |
| `DELETE` | `/api/samples/:id` | Supprimer un échantillon |

Les créations répondent `201`, les modifications et suppressions `204`. Les identifiants inconnus ou hors workspace répondent tous `404`, sans révéler l'existence d'une ressource appartenant à un autre workspace.

La position d’un échantillon est un entier commençant à `1`, converti côté serveur en ligne et colonne selon les dimensions de la box. Un déplacement met à jour la box et les coordonnées dans une seule requête ; la contrainte PostgreSQL interdit toute double occupation.
