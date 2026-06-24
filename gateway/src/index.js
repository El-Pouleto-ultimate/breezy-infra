require('dotenv').config();

const express = require('express');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler.js');
const rateLimit = require('express-rate-limit');
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));

// ─── RATE LIMITING ────────────────────────────────────────────────────────────

// En mode test, on désactive le rate limiting pour que les tests
// puissent créer/supprimer des utilisateurs sans restriction.
const isTest = process.env.NODE_ENV === 'test';

// Limiteur global : 500 requêtes par 15 minutes par IP (sauf en test)
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 999999 : 500,
    message: { error: 'Trop de requêtes, réessaie dans 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Limiteur strict pour login/register : 20 tentatives par 15 minutes (sauf en test)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 999999 : 20,
    message: { error: 'Trop de tentatives de connexion, réessaie dans 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
});

// On applique le limiteur global sur toutes les routes
if (!isTest) app.use(globalLimiter);

// On applique le limiteur strict uniquement sur login et register
if (!isTest) {
    app.use('/api/auth/login', authLimiter);
    app.use('/api/auth/register', authLimiter);
}

// ─── ROUTES AUTH PROTÉGÉES (me, change-password) ─────────────────────────────

app.use('/api/auth/me', authMiddleware, createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/': '/auth/me' },
    on: {
        proxyReq: (proxyReq, req, res) => {
            console.log(`[PROXY] ${req.method} ${req.originalUrl} -> auth-service (protected)`);
            proxyReq.setHeader('x-user-id', req.user.sub);
            proxyReq.setHeader('x-user-role', req.user.role);
            proxyReq.setHeader('x-user-username', req.user.username);
            fixRequestBody(proxyReq, req, res);
        },
        error: (err, req, res) => {
            res.status(502).json({ error: 'Auth service indisponible' });
        }
    }
}));

app.use('/api/auth/change-password', authMiddleware, createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/': '/auth/change-password' },
    on: {
        proxyReq: (proxyReq, req, res) => {
            console.log(`[PROXY] ${req.method} ${req.originalUrl} -> auth-service (protected)`);
            proxyReq.setHeader('x-user-id', req.user.sub);
            proxyReq.setHeader('x-user-role', req.user.role);
            proxyReq.setHeader('x-user-username', req.user.username);
            fixRequestBody(proxyReq, req, res);
        },
        error: (err, req, res) => {
            res.status(502).json({ error: 'Auth service indisponible' });
        }
    }
}));

// ─── ROUTE AUTH USERNAME (mise à jour) — doit être AVANT le catch-all /api/auth ─

app.use('/api/auth/username', authMiddleware, createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/': '/auth/username' },
    on: {
        proxyReq: (proxyReq, req, res) => {
            console.log(`[PROXY] ${req.method} ${req.originalUrl} -> auth-service (username update)`);
            proxyReq.setHeader('x-user-id', req.user.sub);
            proxyReq.setHeader('x-user-role', req.user.role);
            proxyReq.setHeader('x-user-username', req.user.username);
            fixRequestBody(proxyReq, req, res);
        },
        error: (err, req, res) => {
            res.status(502).json({ error: 'Auth service indisponible' });
        }
    }
}));

// ─── ROUTES AUTH ADMIN (create-user) — doit être AVANT le catch-all /api/auth ─

app.use('/api/auth/admin', authMiddleware, createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/': '/auth/admin/' },
    on: {
        proxyReq: (proxyReq, req, res) => {
            console.log(`[PROXY] ${req.method} ${req.originalUrl} -> auth-service (admin)`);
            proxyReq.setHeader('x-user-id', req.user.sub);
            proxyReq.setHeader('x-user-role', req.user.role);
            proxyReq.setHeader('x-user-username', req.user.username);
            fixRequestBody(proxyReq, req, res);
        },
        error: (err, req, res) => {
            res.status(502).json({ error: 'Auth service indisponible' });
        }
    }
}));

// ─── ROUTES AUTH PUBLIQUES (login, register, refresh, logout) ────────────────

app.use('/api/auth', createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/': '/auth/' },
    on: {
        proxyReq: (proxyReq, req, res) => {
            console.log(`[PROXY] ${req.method} ${req.originalUrl} -> auth-service`);
            fixRequestBody(proxyReq, req, res);
        },
        error: (err, req, res) => {
            res.status(502).json({ error: 'Auth service indisponible' });
        }
    }
}));


// ─── ROUTES PROTÉGÉES ────────────────────────────────────────────────────────

// route proxy pour /api/users
app.use('/api/users', authMiddleware, createProxyMiddleware({
    target: process.env.USER_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/': '/users/' },
    on: {
        proxyReq: (proxyReq, req, res) => {
            console.log(`[PROXY] ${req.method} ${req.originalUrl} -> user-service`);
            proxyReq.setHeader('x-user-id', req.user.sub);
            proxyReq.setHeader('x-user-role', req.user.role);
            fixRequestBody(proxyReq, req, res);
        },
        error: (err, req, res) => {
            res.status(502).json({ error: 'User service indisponible' });
        }
    }
}));

// route proxy pour /api/upload (upload de fichiers vers le post-service)
app.use('/api/upload', authMiddleware, createProxyMiddleware({
    target: process.env.POST_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/': '/api/upload' },
    on: {
        proxyReq: (proxyReq, req, res) => {
            console.log(`[PROXY] ${req.method} ${req.originalUrl} -> post-service (upload)`);
            proxyReq.setHeader('x-user-id', req.user.sub);
            proxyReq.setHeader('x-user-role', req.user.role);
            proxyReq.setHeader('x-user-username', req.user.username);
            fixRequestBody(proxyReq, req, res);
        },
        error: (err, req, res) => {
            res.status(502).json({ error: 'Post service indisponible' });
        }
    }
}));

// route proxy pour /api/uploads (fichiers statiques, public)
app.use('/api/uploads', createProxyMiddleware({
    target: process.env.POST_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/': '/api/uploads/' },
    on: {
        proxyReq: (proxyReq, req, res) => {
            console.log(`[PROXY] ${req.method} ${req.originalUrl} -> post-service (static)`);
        },
        error: (err, req, res) => {
            res.status(502).json({ error: 'Post service indisponible' });
        }
    }
}));

// route proxy pour /api/posts
app.use('/api/posts', authMiddleware, createProxyMiddleware({
    target: process.env.POST_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/': '/api/posts/' },
    on: {
        proxyReq: (proxyReq, req, res) => {
            console.log(`[PROXY] ${req.method} ${req.originalUrl} -> post-service`);
            proxyReq.setHeader('x-user-id', req.user.sub);
            proxyReq.setHeader('x-user-role', req.user.role);
            proxyReq.setHeader('x-user-username', req.user.username);
            fixRequestBody(proxyReq, req, res);
        },
        error: (err, req, res) => {
            res.status(502).json({ error: 'Post service indisponible' });
        }
    }
}));

// route proxy pour /api/profils
app.use('/api/profils', authMiddleware, createProxyMiddleware({
    target: process.env.PROFIL_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/': '/api/profils/' },
    on: {
        proxyReq: (proxyReq, req, res) => {
            console.log(`[PROXY] ${req.method} ${req.originalUrl} -> profil-service`);
            proxyReq.setHeader('x-user-id', req.user.sub);
            proxyReq.setHeader('x-user-role', req.user.role);
            proxyReq.setHeader('x-user-username', req.user.username);
            fixRequestBody(proxyReq, req, res);
        },
        error: (err, req, res) => {
            res.status(502).json({ error: 'Profil service indisponible' });
        }
    }
}));

// route proxy pour /api/notifications (hébergées par le profil-service)
app.use('/api/notifications', authMiddleware, createProxyMiddleware({
    target: process.env.PROFIL_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/': '/api/notifications/' },
    on: {
        proxyReq: (proxyReq, req, res) => {
            console.log(`[PROXY] ${req.method} ${req.originalUrl} -> profil-service (notifications)`);
            proxyReq.setHeader('x-user-id', req.user.sub);
            proxyReq.setHeader('x-user-role', req.user.role);
            proxyReq.setHeader('x-user-username', req.user.username);
            fixRequestBody(proxyReq, req, res);
        },
        error: (err, req, res) => {
            res.status(502).json({ error: 'Notification service indisponible' });
        }
    }
}));

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'UP', service: 'api-gateway' });
});

// ─── ERROR HANDLER ───────────────────────────────────────────────────────────

app.use(errorHandler);

// ─── DÉMARRAGE ───────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API Gateway démarré sur le port ${PORT}`);
});
