# Breezy — API Gateway

Point d'entrée unique de l'application. Reçoit toutes les requêtes du frontend,
vérifie les tokens JWT et les redirige vers le bon microservice.

## Rôle

- Routage des requêtes vers les microservices
- Vérification des tokens JWT sur les routes protégées
- Transmission de l'identité utilisateur via les headers `x-user-id` et `x-user-role`
- Rate limiting (double protection avec Nginx)

## Stack

- Node.js 20
- Express.js
- http-proxy-middleware
- jsonwebtoken
- express-rate-limit

## Structure

```text
src/
├── index.js                # Point d'entrée, routes et proxies
├── middleware/
│   ├── auth.js             # Vérification JWT
│   └── errorHandler.js     # Gestion des erreurs centralisée
└── utils/
    └── jwt.utils.js        # Utilitaire de décodage JWT
```


## Variables d'environnement

Crée un fichier `.env` à la racine à partir de `.env.example` :

| Variable | Description |
|---|---|
| `PORT` | Port d'écoute (défaut : 3000) |
| `JWT_SECRET` | Secret partagé avec l'auth-service |
| `AUTH_SERVICE_URL` | URL de l'auth-service |
| `USER_SERVICE_URL` | URL du user-service |
| `POST_SERVICE_URL` | URL du post-service |
| `PROFIL_SERVICE_URL` | URL du profil-service |

## Lancer en local

```bash
npm install
cp .env.example .env   # puis remplis les valeurs
npm run dev
```

## Lancer avec Docker Compose

Depuis le repo `breezy-infra` :

```bash
docker compose up --build
```

## Routes

| Route | Accès | Destination |
|---|---|---|
| `/api/auth/*` | Public | auth-service |
| `/api/users/*` | JWT requis | user-service |
| `/api/posts/*` | JWT requis | post-service |
| `/api/profils/*` | JWT requis | profil-service |
| `/api/health` | Public | gateway (status check) |