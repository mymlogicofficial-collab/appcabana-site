const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

const uploadsDir = path.join(__dirname, '../../uploads');

const iconStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(uploadsDir, 'icons');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});

const iconUpload = multer({
  storage: iconStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    ALLOWED_IMAGE_TYPES.includes(file.mimetype) ? cb(null, true) : cb(new Error('Images only'));
  }
});

// Browse
router.get('/browse', (req, res) => {
  const { category, search, sort, platform } = req.query;
  try {
    let sql = 'SELECT * FROM apps WHERE is_approved = 1';
    const params = [];

    if (category) { sql += ' AND category_slug = ?'; params.push(category); }
    if (platform) { sql += ' AND platform = ?'; params.push(platform); }

    switch (sort) {
      case 'newest': sql += ' ORDER BY created_at DESC'; break;
      case 'popular': sql += ' ORDER BY download_count DESC'; break;
      case 'rating': sql += ' ORDER BY avg_rating DESC'; break;
      case 'name': sql += ' ORDER BY name ASC'; break;
      default: sql += ' ORDER BY download_count DESC';
    }

    let apps = db.prepare(sql).all(...params);

    if (search) {
      const s = search.toLowerCase();
      apps = apps.filter(a =>
        (a.name && a.name.toLowerCase().includes(s)) ||
        (a.description && a.description.toLowerCase().includes(s))
      );
    }

    const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
    res.render('pages/browse', { apps, categories, filters: { category, search, sort, platform } });
  } catch (err) {
    console.error(err);
    res.status(500).render('pages/error', { message: 'Something went wrong' });
  }
});

// App detail
router.get('/app/:slug', (req, res) => {
  try {
    const app = db.prepare('SELECT * FROM apps WHERE slug = ?').get(req.params.slug);
    if (!app) return res.status(404).render('pages/error', { message: 'App not found' });

    const reviews = db.prepare('SELECT * FROM reviews WHERE app_id = ? ORDER BY created_at DESC').all(app.id);
    const related = db.prepare(`
      SELECT * FROM apps WHERE category_slug = ? AND is_approved = 1 AND id != ?
      ORDER BY download_count DESC LIMIT 4
    `).all(app.category_slug, app.id);

    res.render('pages/app-detail', { app, reviews, related });
  } catch (err) {
    console.error(err);
    res.status(500).render('pages/error', { message: 'Something went wrong' });
  }
});

// Submit app form
router.get('/submit', requireAuth, (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  res.render('pages/submit', { categories, error: null });
});

// Submit app
router.post('/submit', requireAuth, iconUpload.single('icon'), (req, res) => {
  const { name, description, long_description, category_id, version, platform, license_type, website_url, source_url, min_os_version } = req.body;
  try {
    if (!name?.trim() || !description?.trim()) {
      const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
      return res.render('pages/submit', { categories, error: 'App name and description are required' });
    }

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const existing = db.prepare('SELECT id FROM apps WHERE slug = ?').get(slug);
    if (existing) {
      const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
      return res.render('pages/submit', { categories, error: 'An app with a similar name already exists' });
    }

    let category_name = null, category_slug = null;
    if (category_id) {
      const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(category_id);
      if (cat) { category_name = cat.name; category_slug = cat.slug; }
    }

    const iconUrl = req.file ? '/uploads/icons/' + req.file.filename : null;
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO apps (id, user_id, name, slug, description, long_description, category_id, category_name, category_slug,
        developer, developer_username, version, platform, license_type, website_url, source_url, min_os_version, icon_url, is_approved)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(id, req.session.user.id, name, slug, description, long_description || null, category_id || null,
      category_name, category_slug, req.session.user.display_name || req.session.user.username,
      req.session.user.username, version || null, platform || 'Windows', license_type || 'Free',
      website_url || null, source_url || null, min_os_version || null, iconUrl);

    res.redirect('/app/' + slug);
  } catch (err) {
    console.error(err);
    const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
    res.render('pages/submit', { categories, error: 'Something went wrong' });
  }
});

// Review
router.post('/app/:slug/review', requireAuth, (req, res) => {
  const { rating, comment } = req.body;
  try {
    const app = db.prepare('SELECT * FROM apps WHERE slug = ?').get(req.params.slug);
    if (!app) return res.redirect('/browse');

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO reviews (id, app_id, user_id, rating, comment, display_name, username)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(app_id, user_id) DO UPDATE SET
        rating = excluded.rating, comment = excluded.comment, updated_at = datetime('now')
    `).run(id, app.id, req.session.user.id, Number(rating), comment || '',
      req.session.user.display_name || req.session.user.username, req.session.user.username);

    // Recalculate avg
    const stats = db.prepare('SELECT COUNT(*) as cnt, AVG(rating) as avg FROM reviews WHERE app_id = ?').get(app.id);
    db.prepare('UPDATE apps SET avg_rating = ?, review_count = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(Math.round((stats.avg || 0) * 10) / 10, stats.cnt, app.id);

    res.redirect('/app/' + req.params.slug);
  } catch (err) {
    console.error(err);
    res.redirect('/app/' + req.params.slug);
  }
});

// Download
router.get('/download/:slug', (req, res) => {
  try {
    const app = db.prepare('SELECT * FROM apps WHERE slug = ?').get(req.params.slug);
    if (!app) return res.status(404).render('pages/error', { message: 'App not found' });
    db.prepare('UPDATE apps SET download_count = download_count + 1 WHERE id = ?').run(app.id);
    if (app.website_url) return res.redirect(app.website_url);
    res.redirect('/app/' + req.params.slug);
  } catch (err) {
    console.error(err);
    res.redirect('/browse');
  }
});

// Admin: approve/feature
router.post('/admin/apps/:id/unapprove', requireAdmin, (req, res) => {
  db.prepare('UPDATE apps SET is_approved = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/admin/apps/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM apps WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/admin/apps/:id/approve', requireAdmin, (req, res) => {
  db.prepare('UPDATE apps SET is_approved = 1 WHERE id = ?').run(req.params.id);
  res.redirect('back');
});

router.post('/admin/apps/:id/feature', requireAdmin, (req, res) => {
  const app = db.prepare('SELECT is_featured FROM apps WHERE id = ?').get(req.params.id);
  if (app) db.prepare('UPDATE apps SET is_featured = ? WHERE id = ?').run(app.is_featured ? 0 : 1, req.params.id);
  res.redirect('back');
});

router.get('/dashboard', requireAuth, (req, res) => {
  const myApps = db.prepare('SELECT * FROM apps WHERE user_id = ? ORDER BY created_at DESC').all(req.session.user.id);
  res.render('pages/dashboard', { myApps });
});


router.post('/admin/apps/:id/edit', requireAdmin, (req, res) => {
  const { name, description, long_description, website_url, icon_url } = req.body;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  db.prepare(`UPDATE apps SET name=?, slug=?, description=?, long_description=?, website_url=?, icon_url=?, updated_at=datetime('now') WHERE id=?`)
    .run(name, slug, description, long_description, website_url || null, icon_url || null, req.params.id);
  res.json({ success: true, slug });
});

module.exports = router;
