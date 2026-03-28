const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('pages/login', { error: null });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.render('pages/login', { error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.render('pages/login', { error: 'Invalid email or password' });

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.display_name,
      is_admin: !!user.is_admin
    };

    // Send them back where they were trying to go, or home if no destination saved
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    console.error(err);
    res.render('pages/login', { error: 'Something went wrong' });
  }
});

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('pages/register', { error: null });
});

router.post('/register', async (req, res) => {
  const { username, email, password, display_name } = req.body;
  try {
    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existing) return res.render('pages/register', { error: 'Username or email already taken' });

    const hash = await bcrypt.hash(password, 12);
    const id = crypto.randomUUID();

    // First user becomes admin
    const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
    const isAdmin = userCount.cnt === 0 ? 1 : 0;

    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, display_name, is_admin)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, username, email, hash, display_name || username, isAdmin);

    req.session.user = { id, username, email, display_name: display_name || username, is_admin: !!isAdmin };

    // Send them back where they were trying to go, or home
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    console.error(err);
    res.render('pages/register', { error: 'Something went wrong' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
