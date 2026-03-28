function requireAuth(req, res, next) {
  if (!req.session.user) {
    // Save where they were trying to go so we can send them back after login
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) {
    return res.status(403).render('pages/error', { message: 'Access denied' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
