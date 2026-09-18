# API cr.io

Toutes les routes métier exigent le cookie de session `crio_session`. Le workspace n'est jamais fourni par le client : il est résolu depuis la session afin d'empêcher les accès croisés.

| Méthode | Route | Fonction |
| --- | --- | --- |
| `GET` | `/api/storage` | Hiérarchie complète du workspace |
| `POST` | `/api/freezers` | Créer un freezer |
| `PATCH` | `/api/freezers/:id` | Modifier un freezer |
| `DELETE` | `/api/freezers/:id` | Supprimer un freezer et son contenu |
| `POST` | `/api/freezers/:freezerId/racks` | Créer un rack |
| `PATCH` | `/api/racks/:id` | Modifier un rack |
| `DELETE` | `/api/racks/:id` | Supprimer un rack et son contenu |
| `POST` | `/api/racks/:rackId/boxes` | Créer une box |
| `PATCH` | `/api/boxes/:id` | Modifier une box |
| `DELETE` | `/api/boxes/:id` | Supprimer une box et son contenu |

Les créations répondent `201`, les modifications et suppressions `204`. Les identifiants inconnus ou hors workspace répondent tous `404`, sans révéler l'existence d'une ressource appartenant à un autre workspace.
