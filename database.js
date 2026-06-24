const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL || 'banque.db';

const dbPath = path.join(__dirname, DATABASE_URL);

// Créer la connexion à la base de données
const db = new sqlite3.Database(dbPath, () => {
  console.log('Connecté à la base de données SQLite');
  initializeDatabase();
});

// Initialiser les tables
function initializeDatabase() {
  db.serialize(() => {
    // Table comptes
    db.run(`
      CREATE TABLE IF NOT EXISTS comptes (
        id TEXT PRIMARY KEY,
        nom TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        solde REAL DEFAULT 0.0,
        date_creation TEXT NOT NULL,
        code_hash TEXT NOT NULL
      )
    `);

    // Table transactions
    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        montant REAL NOT NULL,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        compte_source TEXT,
        compte_destination TEXT,
        FOREIGN KEY (compte_source) REFERENCES comptes(id) ON DELETE SET NULL,
        FOREIGN KEY (compte_destination) REFERENCES comptes(id) ON DELETE SET NULL
      )
    `);
  });
}

module.exports = db;
