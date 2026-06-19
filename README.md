# Breezy — Infrastructure

Contient toute la configuration d'orchestration de l'application :
Docker Compose, Nginx, et variables d'environnement.

## Structure

```text
breezy-infra/
├── nginx/
│   ├── Dockerfile       ← image Nginx
│   └── nginx.conf       ← configuration reverse proxy + rate limiting
├── docker-compose.yml   ← orchestration de tous les services
├── .env                 ← variables d'environnement (non versionné)
└── .env.example         ← template des variables
```

## Prérequis

- Docker Desktop installé
- Tous les repos Breezy clonés dans le même dossier parent :

```text
breezy/
├── breezy-infra/          ← ce repo
├── breezy-frontend/
├── breezy-gateway/
├── breezy-auth-service/
├── breezy-user-service/
├── breezy-post-service/
└── breezy-profil-service/
```

## Lancer l'application

```bash
# 1. Copier et remplir le fichier d'environnement
cp .env.example .env

# 2. Lancer tous les services
docker compose up --build

# 3. L'application est disponible sur
http://localhost
```

## Arrêter l'application

```bash
docker compose down          # arrête les conteneurs
docker compose down -v       # arrête et supprime les volumes (remet les BDD à zéro)
```

## Services et ports internes

| Service | Port interne | Accessible depuis l'extérieur |
|---|---|---|
| Nginx | 80 | ✅ http://localhost |
| API Gateway | 3000 | ❌ (via Nginx uniquement) |
| auth-service | 3001 | ❌ |
| user-service | 3002 | ❌ |
| post-service | 3003 | ❌ |
| profil-service | 3004 | ❌ |
| PostgreSQL auth | 5432 | ❌ |
| PostgreSQL users | 5432 | ❌ |
| MongoDB posts | 27017 | ❌ |
| MongoDB profils | 27017 | ❌ |

## Sécurité

- Seul le port 80 (Nginx) est exposé à l'extérieur
- Rate limiting sur toutes les routes API (30 req/min)
- Rate limiting renforcé sur `/api/auth` (5 req/min) contre le brute force
- Les tokens JWT ne sont vérifiés qu'une seule fois, dans la gateway