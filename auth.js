const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Compte } = require('./models');

const SECRET_KEY = 'votre-cle-secrete-tres-longue-et-complexe';
const ALGORITHM = 'HS256';
const ACCESS_TOKEN_EXPIRE_MINUTES = 30;

// Hasher un mot de passe
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// Vérifier un mot de passe
async function verifyPassword(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword);
}

// Créer un token JWT
function createAccessToken(data) {
  const expiresIn = `${ACCESS_TOKEN_EXPIRE_MINUTES}m`;
  return jwt.sign(data, SECRET_KEY, { algorithm: ALGORITHM, expiresIn });
}

// Vérifier un token JWT
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, SECRET_KEY, { algorithms: [ALGORITHM] });
  } catch (error) {
    return null;
  }
}

// Middleware d'authentification
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ detail: 'Token manquant' });
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    return res.status(401).json({ detail: 'Token invalide' });
  }

  try {
    const compte = await Compte.findByEmail(payload.sub);
    if (!compte) {
      return res.status(401).json({ detail: 'Utilisateur non trouvé' });
    }

    req.user = compte;
    next();
  } catch (error) {
    return res.status(500).json({ detail: 'Erreur serveur' });
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  createAccessToken,
  authenticateToken
};
