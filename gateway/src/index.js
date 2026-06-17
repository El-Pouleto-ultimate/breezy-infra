require('dotenv').config();

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler.js');
const app = express();
app.use(express.json());    

// ─── ROUTES PUBLIQUES ────────────────────────────────────────────────────────

// route proxy pour /api/auth
app.use('/api/auth', createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL,
    changeOrigin: true,

    on: {
        proxyReq: (proxyReq, req) => {
            console.log(`[PROXY] ${req.method} ${req.path} -> auth-service`);
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
    on: {
        proxyReq: (proxyReq, req) => {
            console.log(`[PROXY] ${req.method} ${req.path} -> user-service`);
            proxyReq.setHeader('x-user-id', req.user.id);
            proxyReq.setHeader('x-user-role', req.user.role);
        },
        error: (err, req, res) => {
            res.status(502).json({ error: 'User service indisponible' });
        }
    }
}));

// route proxy pour /api/posts
app.use('/api/posts', authMiddleware, createProxyMiddleware({
    target: process.env.POST_SERVICE_URL,
    changeOrigin: true,
    on: {
        proxyReq: (proxyReq, req) => {
            console.log(`[PROXY] ${req.method} ${req.path} -> post-service`);
            proxyReq.setHeader('x-user-id', req.user.id);
            proxyReq.setHeader('x-user-role', req.user.role);
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
    on: {
        proxyReq: (proxyReq, req) => {
            console.log(`[PROXY] ${req.method} ${req.path} -> profil-service`);
            proxyReq.setHeader('x-user-id', req.user.id);
            proxyReq.setHeader('x-user-role', req.user.role);
        },
        error: (err, req, res) => {
            res.status(502).json({ error: 'Profil service indisponible' });
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