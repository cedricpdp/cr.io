# Héberger cr.io gratuitement

La combinaison retenue pour la démo full-stack est :

- **Render Free** pour exécuter le conteneur Node.js ;
- **Neon Free** pour conserver PostgreSQL sans expiration à 30 jours.

Cette configuration convient à une démo ou un petit projet personnel. Render met le service en veille après 15 minutes sans requête : la première ouverture suivante peut prendre environ une minute. Neon limite son offre gratuite à 0,5 Go de stockage et à son quota mensuel de calcul.

## 1. Créer la base Neon

1. Ouvrir [Neon](https://console.neon.tech/) et se connecter, par exemple avec GitHub.
2. Créer un projet nommé `crio`, de préférence dans une région européenne.
3. Dans **Connect**, sélectionner la connexion **Pooled**.
4. Copier l’URL PostgreSQL complète. Elle commence par `postgresql://` et contient déjà les paramètres SSL.

Ne jamais ajouter cette URL au dépôt Git : elle contient le mot de passe de la base.

## 2. Déployer l’application

Ouvrir le Blueprint prêt à l’emploi :

[Déployer cr.io sur Render](https://render.com/deploy?repo=https://github.com/cedricpdp/cr.io)

Render lit automatiquement `render.yaml`. Pendant la création :

1. connecter le compte GitHub si nécessaire ;
2. conserver le plan **Free** ;
3. coller l’URL Neon dans la variable secrète `DATABASE_URL` ;
4. confirmer la création du Blueprint.

Le premier démarrage construit l’image, applique la migration de base de données, puis expose l’application sur une adresse `onrender.com` en HTTPS.

## 3. Vérifier

Une fois le statut Render à **Live** :

- ouvrir l’URL `onrender.com` ;
- créer le premier compte cr.io ;
- vérifier `https://<adresse>/api/health` : la réponse doit contenir `status: "ok"` et `database: "ok"`.

Les déploiements suivants sont automatiques après le passage au vert des contrôles GitHub de `main`.

## Pourquoi deux contrôles HTTP ?

Render appelle `/api/live`, qui vérifie uniquement le processus web. Il ne réveille donc pas PostgreSQL en permanence et préserve le quota gratuit de Neon. `/api/health` teste aussi réellement la base et reste disponible pour un contrôle manuel.

## Limites à connaître

- le premier affichage après une période d’inactivité est lent à cause du réveil Render ;
- le gratuit n’offre pas de garantie de disponibilité ;
- les quotas des deux fournisseurs doivent rester surveillés ;
- pour de vraies données de laboratoire, prévoir ensuite sauvegardes, domaine, politique de confidentialité et offre payante ou serveur maîtrisé.
