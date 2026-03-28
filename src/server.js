const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { WebhookHandlers } = require('./webhookHandlers');

// Session store using SQLite
const SqliteStore = require('./sessionStore');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Stripe webhook must come before body parsers
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).json({ error: 'Missing signature' });
  try {
    const sig = Array.isArray(signature) ? signature[0] : signature;
    await WebhookHandlers.processWebhook(req.body, sig);
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(400).json({ error: 'Webhook processing error' });
  }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.static(path.join(__dirname, '../public')));

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

app.use(session({
  store: new SqliteStore(db),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' }
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

const authRoutes = require('./routes/auth');
const appRoutes = require('./routes/apps');
const apiRoutes = require('./routes/api');

app.use('/', authRoutes);
app.use('/', appRoutes);
app.use('/api', apiRoutes);

app.get('/', async (req, res) => {
  try {
    const apps = db.prepare(`
      SELECT * FROM apps WHERE is_approved = 1
      ORDER BY is_featured DESC, download_count DESC
      LIMIT 12
    `).all();

    const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();

    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_apps,
        SUM(download_count) as total_downloads
      FROM apps WHERE is_approved = 1
    `).get();

    const devStats = db.prepare('SELECT COUNT(*) as total_developers FROM users').get();

    res.render('pages/home', {
      apps,
      categories,
      stats: {
        total_apps: stats.total_apps || 0,
        total_downloads: stats.total_downloads || 0,
        total_developers: devStats.total_developers || 0
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('pages/error', { message: 'Something went wrong' });
  }
});

app.use((req, res) => {
  res.status(404).render('pages/error', { message: 'Page not found' });
});

module.exports = app;
