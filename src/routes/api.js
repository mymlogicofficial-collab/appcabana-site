const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/apps', (req, res) => {
  try {
    const { search, category, platform } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);

    let sql = 'SELECT * FROM apps WHERE is_approved = 1';
    const params = [];
    if (category) { sql += ' AND category_slug = ?'; params.push(category); }
    if (platform) { sql += ' AND platform = ?'; params.push(platform); }
    sql += ' ORDER BY download_count DESC';

    let apps = db.prepare(sql).all(...params);

    if (search) {
      const s = search.toLowerCase();
      apps = apps.filter(a =>
        (a.name && a.name.toLowerCase().includes(s)) ||
        (a.description && a.description.toLowerCase().includes(s))
      );
    }

    res.json({ apps: apps.slice(0, limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/categories', (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
    categories.forEach(cat => {
      cat.app_count = db.prepare('SELECT COUNT(*) as cnt FROM apps WHERE category_slug = ? AND is_approved = 1').get(cat.slug).cnt;
    });
    res.json({ categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/apps/:id/save-to-vault', (req, res) => {
  try {
    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND is_approved = 1').get(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });

    db.prepare('UPDATE apps SET download_count = download_count + 1 WHERE id = ?').run(app.id);
    res.json({ success: true, app: { name: app.name, version: app.version }, message: 'Ready' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
