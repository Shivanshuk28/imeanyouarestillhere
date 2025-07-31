// src/authMiddleware.js
const AUTH_TOKEN = process.env.AUTH_TOKEN;

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or malformed.' });
  }

  const token = authHeader.split(' ')[1];

  if (token === AUTH_TOKEN) {
    next(); // Token is valid, proceed to the next middleware/route handler
  } else {
    return res.status(403).json({ error: 'Invalid authentication token.' });
  }
};

module.exports = authMiddleware;