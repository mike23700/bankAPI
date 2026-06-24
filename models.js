const db = require('./database');

// Modèle Compte
class Compte {
  static create(compteData) {
    return new Promise((resolve, reject) => {
      const { id, nom, email, solde, date_creation, code_hash } = compteData;
      const sql = `INSERT INTO comptes (id, nom, email, solde, date_creation, code_hash) VALUES (?, ?, ?, ?, ?, ?)`;
      db.run(sql, [id, nom, email, solde, date_creation, code_hash], function(err) {
        /* v8 ignore next */
        if (err) return reject(err);
        resolve({ id, nom, email, solde, date_creation });
      });
    });
  }

  static findByEmail(email) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM comptes WHERE email = ?`;
      db.get(sql, [email], (err, row) => {
        /* v8 ignore next */
        if (err) return reject(err);
        resolve(row);
      });
    });
  }

  static findById(id) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM comptes WHERE id = ?`;
      db.get(sql, [id], (err, row) => {
        /* v8 ignore next */
        if (err) return reject(err);
        resolve(row);
      });
    });
  }

  static findAll() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT id, nom, email, solde, date_creation FROM comptes`;
      db.all(sql, [], (err, rows) => {
        /* v8 ignore next */
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  static search(query) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT id, nom, email, solde, date_creation FROM comptes 
                   WHERE LOWER(nom) LIKE ? OR LOWER(email) LIKE ? OR id = ?`;
      const searchTerm = `%${query.toLowerCase()}%`;
      db.all(sql, [searchTerm, searchTerm, query], (err, rows) => {
        /* v8 ignore next */
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  static updateSolde(id, nouveauSolde) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE comptes SET solde = ? WHERE id = ?`;
      db.run(sql, [nouveauSolde, id], function(err) {
        /* v8 ignore next */
        if (err) return reject(err);
        resolve(this.changes);
      });
    });
  }

  static delete(id) {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM comptes WHERE id = ?`;
      db.run(sql, [id], function(err) {
        /* v8 ignore next */
        if (err) return reject(err);
        resolve(this.changes);
      });
    });
  }
}

// Modèle Transaction
class Transaction {
  static create(transactionData) {
    return new Promise((resolve, reject) => {
      const { id, type, montant, date, description, compte_source, compte_destination } = transactionData;
      const sql = `INSERT INTO transactions (id, type, montant, date, description, compte_source, compte_destination) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;
      db.run(sql, [id, type, montant, date, description, compte_source, compte_destination], function(err) {
        /* v8 ignore next */
        if (err) return reject(err);
        resolve({ id, type, montant, date, description, compte_source, compte_destination });
      });
    });
  }

  static findByCompte(compteId) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM transactions 
                   WHERE compte_source = ? OR compte_destination = ? 
                   ORDER BY date DESC`;
      db.all(sql, [compteId, compteId], (err, rows) => {
        /* v8 ignore next */
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  static deleteByCompte(compteId) {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM transactions WHERE compte_source = ? OR compte_destination = ?`;
      db.run(sql, [compteId, compteId], function(err) {
        /* v8 ignore next */
        if (err) return reject(err);
        resolve(this.changes);
      });
    });
  }
}

module.exports = { Compte, Transaction };
