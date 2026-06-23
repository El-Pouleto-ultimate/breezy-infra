#!/usr/bin/env node
/**
 * Breezy Seed — Peuple la DB avec 12 comptes + contenu.
 *
 * Usage :
 *   node seed/seed.js                # local (gateway sur localhost)
 *   GATEWAY_URL=http://mon-serveur/api node seed/seed.js   # prod/demo
 *
 * Prérequis :
 *   - Gateway accessible (rate limit désactivé ou NODE_ENV=test)
 *   - Accès direct PostgreSQL pour la promotion des rôles
 *     (docker exec ou psql selon l'environnement)
 */

const axios = require('axios');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE = process.env.GATEWAY_URL || 'http://localhost/api';
const PASS = process.env.SEED_PASSWORD || 'Breezy2024!';
const ROLE_MODE = process.env.SEED_ROLE_MODE || 'docker'; // 'docker' | 'psql' | 'skip'

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

const ACCOUNTS = [
  { username: 'admin_emma',    email: 'admin.emma@breezy.test',    role: 'admin' },
  { username: 'admin_thomas',  email: 'admin.thomas@breezy.test',  role: 'admin' },
  { username: 'admin_sarah',   email: 'admin.sarah@breezy.test',   role: 'admin' },
  { username: 'modo_lucas',    email: 'modo.lucas@breezy.test',    role: 'moderator' },
  { username: 'modo_chloe',    email: 'modo.chloe@breezy.test',    role: 'moderator' },
  { username: 'modo_hugo',     email: 'modo.hugo@breezy.test',     role: 'moderator' },
  { username: 'alex_photo',    email: 'alex.photo@breezy.test',    role: 'user' },
  { username: 'lea_voyage',    email: 'lea.voyage@breezy.test',    role: 'user' },
  { username: 'max_tech',      email: 'max.tech@breezy.test',      role: 'user' },
  { username: 'julie_food',    email: 'julie.food@breezy.test',    role: 'user' },
  { username: 'nathan_music',  email: 'nathan.music@breezy.test',  role: 'user' },
  { username: 'camille_art',   email: 'camille.art@breezy.test',   role: 'user' },
];

const POSTS = {
  admin_emma:   ['Bienvenue sur Breezy ! Règles à lire 📋', 'Mise à jour déployée ce matin.', 'Vérifiez vos paramètres de confidentialité.'],
  admin_thomas: ['Rappel : comptes inactifs nettoyés ce weekend.', 'Le support répond en moins de 24h.'],
  admin_sarah:  ['Merci aux modérateurs pour leur travail !', 'Nouveau système de signalement en ligne.'],
  modo_lucas:   ['Attention aux spoilers dans les commentaires.', 'Post signalé — en cours de review.'],
  modo_chloe:   ['Pas de harcèlement. Les comptes seront bannis.'],
  modo_hugo:    ['Je vérifie les comptes signalés.', 'Si vous voyez un abus, signalez-le.'],
  alex_photo:   ['Nouveau shooting au coucher du soleil 🌅', 'Quel objectif pour du portrait ?', 'Retouche avant/après !'],
  lea_voyage:   ['De retour de Tokyo, incroyable ! 🗾', 'Meilleur café découvert à Melbourne ☕', 'Quel pays visiter en Asie ?'],
  max_tech:     ['Nouveau framework JS, qui a testé ?', 'Mon setup dev 2026 : 4K + mechanical keyboard', 'Le télétravail a changé ma vie.'],
  julie_food:   ['Recette pasta : le secret c\'est l\'ail confit 🍝', 'Top 5 restos Paris < 20€', 'Qui a testé le air fryer ?'],
  nathan_music: ['Nouveau morceau en ligne 🎸', 'Qui va à WeLoveGreen ce weekend ?', 'Jam session hier, quelle énergie !'],
  camille_art:  ['Nouvelle toile terminée 🎨', 'Opening galerie vendredi, venez !', 'Aquarelle vs acrylique ?'],
};

const FOLLOWS = [
  ['admin_emma',  'admin_thomas', 'admin_sarah', 'modo_lucas', 'alex_photo', 'lea_voyage'],
  ['admin_thomas','admin_emma', 'modo_chloe', 'max_tech'],
  ['admin_sarah', 'admin_emma', 'modo_hugo', 'julie_food', 'nathan_music'],
  ['modo_lucas',  'alex_photo', 'lea_voyage'],
  ['modo_chloe',  'max_tech', 'camille_art', 'admin_emma'],
  ['modo_hugo',   'nathan_music', 'julie_food', 'admin_thomas'],
  ['alex_photo',  'lea_voyage', 'camille_art', 'nathan_music', 'max_tech'],
  ['lea_voyage',  'alex_photo', 'julie_food', 'camille_art'],
  ['max_tech',    'nathan_music', 'alex_photo', 'admin_thomas'],
  ['julie_food',  'lea_voyage', 'camille_art', 'modo_chloe'],
  ['nathan_music','max_tech', 'alex_photo', 'camille_art'],
  ['camille_art', 'lea_voyage', 'julie_food', 'alex_photo'],
];

const COMMENTS = [
  'Super post ! 👍', 'Trop bien dit', 'Je suis d\'accord', 'Intéressant !',
  'Merci pour le partage 🙏', 'J\'adore !', 'Hâte d\'en voir plus',
  'Bien vu !', 'Excellent contenu', 'Continue comme ça !',
];

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const sleep = ms => new Promise(r => setTimeout(r, ms));

const api = async (method, url, token, data) => {
  try {
    const cfg = { timeout: 10000, headers: token ? { Authorization: `Bearer ${token}` } : {} };
    const u = url.startsWith('http') ? url : `${BASE}${url}`;
    const res = method === 'get'    ? await axios.get(u, cfg)
              : method === 'post'   ? await axios.post(u, data, cfg)
              : method === 'put'    ? await axios.put(u, data, cfg)
              : method === 'delete' ? await axios.delete(u, { ...cfg, data })
              : null;
    return { ok: res.status >= 200 && res.status < 300, status: res.status, data: res.data };
  } catch (e) {
    return { ok: false, status: e.response?.status || 0, error: e.message, data: e.response?.data };
  }
};

/**
 * Change le rôle d'un utilisateur.
 * Mode 'docker' : passe par docker exec sur le container pg (développement local)
 * Mode 'psql'   : passe par psql direct (DATABASE_URL doit être dans l'env)
 * Mode 'skip'   : ne fait rien (les rôles devront être changés manuellement)
 */
const setRole = (username, role) => {
  switch (ROLE_MODE) {
    case 'docker':
      try {
        execSync(
          `docker exec breezy-db-pg-auth psql -U user -d auth_db -c "UPDATE users SET role='${role}' WHERE username='${username}';"`,
          { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }
        );
        return true;
      } catch { return false; }

    case 'psql':
      try {
        const dbUrl = process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL;
        if (!dbUrl) { console.warn('    ⚠️  AUTH_DATABASE_URL non défini, impossible de changer le rôle'); return false; }
        execSync(
          `psql "${dbUrl}" -c "UPDATE users SET role='${role}' WHERE username='${username}';"`,
          { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }
        );
        return true;
      } catch { return false; }

    case 'skip':
      console.log(`    ℹ️  Rôle '${role}' pour @${username} — À FAIRE MANUELLEMENT`);
      return false;

    default:
      return false;
  }
};

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

(async () => {
  console.log('🌱  BREEZY SEED');
  console.log(`    Gateway : ${BASE}`);
  console.log(`    Role mode : ${ROLE_MODE}\n`);

  const users = {};
  const posts = {};

  // ─── PHASE 1 : COMPTES ──────────────────────────────────────

  console.log('── Phase 1/5 : Création des 12 comptes ──');
  let i = 0;
  for (const a of ACCOUNTS) {
    // Si pas en mode test, on espace les requêtes pour respecter le rate limit
    // (20 req / 15 min sur auth/register et auth/login)
    if (i > 0 && i % 5 === 0) {
      process.stdout.write('  ⏳  pause rate-limit (3s)...');
      await sleep(3000);
      console.log(' OK');
    }
    i++;

    const r = await api('post', '/auth/register', null, {
      username: a.username,
      email: a.email,
      password: PASS
    });

    if (r.ok && r.data.token) {
      users[a.username] = { id: r.data.user.id, token: r.data.token, email: a.email, role: a.role };
      console.log(`  ✅ @${a.username} — ${a.role}`);
    } else {
      // Compte déjà existant → on tente un login
      const l = await api('post', '/auth/login', null, { email: a.email, password: PASS });
      if (l.ok && l.data.token) {
        // Récupérer l'ID utilisateur
        const me = await api('get', '/auth/me', l.data.token);
        const uid = me.data?.id || me.data?.user?.id || '?';
        users[a.username] = { id: uid, token: l.data.token, email: a.email, role: a.role };
        console.log(`  ♻️  @${a.username} existant — ${a.role}`);
      } else {
        console.log(`  ❌ @${a.username} — status ${r.status} ${r.data?.error?.code || r.error || ''}`);
      }
    }
  }

  // ─── PHASE 2 : RÔLES ────────────────────────────────────────

  console.log('\n── Phase 2/5 : Promotion admin/modo ──');
  const needsRelogin = [];

  for (const a of ACCOUNTS) {
    if (a.role === 'admin' || a.role === 'moderator') {
      const ok = setRole(a.username, a.role);
      if (ok) {
        console.log(`  ✅ @${a.username} → ${a.role}`);
        needsRelogin.push(a.username);
      } else if (ROLE_MODE === 'skip') {
        // déjà loggé
      } else {
        console.log(`  ⚠️  @${a.username} → échec promotion ${a.role}`);
      }
    }
  }

  // Rafraîchir les tokens des comptes promus (le vieux JWT a role='user')
  if (needsRelogin.length > 0) {
    console.log('  🔄  Re-login des comptes promus pour JWT à jour...');
    for (const uname of needsRelogin) {
      const u = users[uname];
      if (!u) continue;
      const l = await api('post', '/auth/login', null, { email: u.email, password: PASS });
      if (l.ok && l.data.token) {
        u.token = l.data.token;
        console.log(`    ✅ @${uname} — nouveau token (rôle OK)`);
      }
    }
  }

  // ─── PHASE 3 : POSTS ────────────────────────────────────────

  console.log('\n── Phase 3/5 : Publication des messages ──');
  let totalPosts = 0;
  for (const [uname, contents] of Object.entries(POSTS)) {
    const u = users[uname];
    if (!u?.token) continue;
    posts[uname] = [];
    for (const content of contents) {
      const r = await api('post', '/posts', u.token, { content });
      if (r.ok) {
        const pid = r.data?.data?._id || r.data?._id;
        if (pid) { posts[uname].push(pid); totalPosts++; }
      }
    }
    console.log(`  📝 @${uname} : ${posts[uname].length} posts`);
  }

  // ─── PHASE 4 : FOLLOWS ──────────────────────────────────────

  console.log('\n── Phase 4/5 : Abonnements ──');
  let follows = 0;
  for (const [follower, ...followedList] of FOLLOWS) {
    const fu = users[follower];
    if (!fu?.token) continue;
    for (const target of followedList) {
      const tu = users[target];
      if (!tu?.id) continue;
      const r = await api('post', `/users/${tu.id}/follow`, fu.token);
      if (r.ok) follows++;
    }
  }
  console.log(`  👥 ${follows} follows créés`);

  // ─── PHASE 5 : LIKES + COMMENTS ─────────────────────────────

  console.log('\n── Phase 5/5 : Likes et commentaires ──');
  let likes = 0, comments = 0;
  const allUsernames = Object.keys(users);

  for (const uname of allUsernames) {
    const u = users[uname];
    if (!u?.token) continue;

    const others = [];
    for (const [owner, pids] of Object.entries(posts)) {
      if (owner !== uname) others.push(...pids);
    }
    if (!others.length) continue;

    // Liker 3 posts
    const toLike = others.sort(() => Math.random() - 0.5).slice(0, 3);
    for (const pid of toLike) {
      const r = await api('post', `/posts/${pid}/like`, u.token);
      if (r.ok) likes++;
    }

    // Commenter 2 posts
    const toComment = others.sort(() => Math.random() - 0.5).slice(0, 2);
    for (const pid of toComment) {
      const txt = COMMENTS[Math.floor(Math.random() * COMMENTS.length)];
      const r = await api('post', `/posts/${pid}/comments`, u.token, { content: txt });
      if (r.ok) comments++;
    }
  }
  console.log(`  ❤️  ${likes} likes`);
  console.log(`  💬 ${comments} commentaires`);

  // ─── RÉSUMÉ ─────────────────────────────────────────────────

  const roleOrder = { admin: 0, moderator: 1, user: 2 };
  const sorted = Object.entries(users).sort((a, b) => roleOrder[a[1].role] - roleOrder[b[1].role]);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  📋 RÉSUMÉ DES COMPTES SEED');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('┌────┬──────────────────┬──────────────────────────────┬────────────┬───────────┐');
  console.log('│  # │ Username         │ Email                        │ Rôle       │ Posts     │');
  console.log('├────┼──────────────────┼──────────────────────────────┼────────────┼───────────┤');

  let idx = 1;
  for (const [username, info] of sorted) {
    const badge = info.role === 'admin' ? '🔴 ADMIN' : info.role === 'moderator' ? '🟡 MODÉRATEUR' : '🟢 UTILISATEUR';
    const n = (posts[username] || []).length;
    console.log(`│ ${String(idx++).padStart(2)} │ ${username.padEnd(16)} │ ${info.email.padEnd(28)} │ ${badge.padEnd(10)} │ ${String(n).padStart(9)} │`);
  }
  console.log('└────┴──────────────────┴──────────────────────────────┴────────────┴───────────┘');

  console.log('');
  console.log('┌──────────────────────────────────────────────────────┐');
  console.log('│ 🔑  MOT DE PASSE UNIQUE                              │');
  console.log(`│     ${PASS}                                  │`);
  console.log('├──────────────────────────────────────────────────────┤');
  console.log('│ 📊  STATISTIQUES                                     │');
  console.log(`│     ${String(Object.keys(users).length).padStart(3)} comptes, ${String(totalPosts).padStart(3)} posts, ${String(follows).padStart(3)} follows              │`);
  console.log(`│     ${String(likes).padStart(3)} likes, ${String(comments).padStart(3)} commentaires                              │`);
  console.log('├──────────────────────────────────────────────────────┤');
  console.log('│ 🚀  CONNEXION EXEMPLE                                │');
  console.log('│     email    : admin.emma@breezy.test                │');
  console.log('│     password : Breezy2024!                           │');
  console.log('├──────────────────────────────────────────────────────┤');
  console.log('│ 🌍  USAGE PRODUCTION                                 │');
  console.log('│     GATEWAY_URL=https://breezy.example.com/api \\     │');
  console.log('│     SEED_ROLE_MODE=psql \\                            │');
  console.log('│     AUTH_DATABASE_URL=postgres://... \\               │');
  console.log('│     node seed/seed.js                                │');
  console.log('└──────────────────────────────────────────────────────┘');
  console.log('');

  // Sauvegarde JSON
  const summary = {
    password: PASS,
    created: new Date().toISOString(),
    gateway: BASE,
    accounts: sorted.map(([username, info]) => ({
      username, email: info.email, role: info.role,
      userId: info.id, posts: posts[username] || [],
    })),
    stats: { users: Object.keys(users).length, posts: totalPosts, follows, likes, comments },
  };
  fs.writeFileSync(path.join(__dirname, 'accounts.json'), JSON.stringify(summary, null, 2));
  console.log('💾  Résumé sauvegardé → seed/accounts.json\n');
})();
