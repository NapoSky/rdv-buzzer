function verifyAdminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const APP_SECRET = process.env.APP_SECRET;
  
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing' });
    }
  
    const token = authHeader.split(' ')[1];
  
    if (token !== APP_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  
    next();
  }
  
  module.exports = {
    verifyAdminAuth
  };