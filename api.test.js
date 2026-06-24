import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from './server.js';
import db from './database.js';

describe('API Banque - Tests Complets', () => {
  let tokenUser1 = '';
  let tokenUser2 = '';
  let idUser1 = '';
  let idUser2 = '';

  // Nettoyage de la base de données avant les tests
  beforeAll(async () => {
    // Petit délai pour s'assurer que SQLite a fini de créer les tables
    await new Promise(r => setTimeout(r, 500));
    await new Promise((resolve, reject) => db.run('DELETE FROM transactions', err => err ? reject(err) : resolve()));
    await new Promise((resolve, reject) => db.run('DELETE FROM comptes', err => err ? reject(err) : resolve()));
  });

  describe('1. Création de comptes et Authentification', () => {
    it('Devrait créer un premier compte (Utilisateur 1)', async () => {
      const res = await request(app).post('/comptes/').send({
        nom: 'Alice Dupont',
        email: 'alice@test.com',
        code: 'password123',
        solde_initial: 1000
      });
      expect(res.statusCode).toBe(201);
      expect(res.body.nom).toBe('Alice Dupont');
      expect(res.body.solde).toBe(1000);
      idUser1 = res.body.id;
    });

    it('Devrait créer un deuxième compte (Utilisateur 2)', async () => {
      const res = await request(app).post('/comptes/').send({
        nom: 'Bob Martin',
        email: 'bob@test.com',
        code: 'password456',
        solde_initial: 0
      });
      expect(res.statusCode).toBe(201);
      idUser2 = res.body.id;
    });

    it('Ne devrait pas permettre de créer un compte avec un email existant', async () => {
      const res = await request(app).post('/comptes/').send({
        nom: 'Alice Clone',
        email: 'alice@test.com', // Même email
        code: '123'
      });
      expect(res.statusCode).toBe(400);
    });

    it('Devrait générer un token pour Alice (Connexion)', async () => {
      const res = await request(app).post('/token').send({
        username: 'alice@test.com',
        password: 'password123'
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('access_token');
      tokenUser1 = res.body.access_token;
    });

    it('Devrait générer un token pour Bob (Connexion)', async () => {
      const res = await request(app).post('/token').send({
        username: 'bob@test.com',
        password: 'password456'
      });
      expect(res.statusCode).toBe(200);
      tokenUser2 = res.body.access_token;
    });

    it('Devrait rejeter une connexion avec mauvais mot de passe', async () => {
      const res = await request(app).post('/token').send({
        username: 'alice@test.com',
        password: 'wrongpassword'
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('2. Opérations sur le compte (Dépôts et Retraits)', () => {
    it('Devrait récupérer les infos du compte d\'Alice', async () => {
      const res = await request(app).get('/mon-compte').set('Authorization', `Bearer ${tokenUser1}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.solde).toBe(1000);
    });

    it('Devrait permettre à Alice de faire un dépôt', async () => {
      const res = await request(app).post('/depot').set('Authorization', `Bearer ${tokenUser1}`).send({
        montant: 500,
        description: 'Argent de poche'
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.nouveau_solde).toBe(1500); // 1000 + 500
    });

    it('Devrait empêcher un dépôt de montant négatif', async () => {
      const res = await request(app).post('/depot').set('Authorization', `Bearer ${tokenUser1}`).send({
        montant: -100
      });
      expect(res.statusCode).toBe(400);
    });

    it('Devrait permettre à Alice de faire un retrait', async () => {
      const res = await request(app).post('/retrait').set('Authorization', `Bearer ${tokenUser1}`).send({
        montant: 200,
        description: 'Achat supermarché'
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.nouveau_solde).toBe(1300); // 1500 - 200
    });

    it('Devrait empêcher un retrait si solde insuffisant', async () => {
      const res = await request(app).post('/retrait').set('Authorization', `Bearer ${tokenUser1}`).send({
        montant: 5000 // Plus que 1300
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('3. Transferts', () => {
    it('Devrait permettre à Alice de transférer de l\'argent à Bob', async () => {
      const res = await request(app).post('/transfert').set('Authorization', `Bearer ${tokenUser1}`).send({
        montant: 300,
        compte_destination_id: idUser2,
        description: 'Remboursement resto'
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.nouveau_solde).toBe(1000); // 1300 - 300
    });

    it('Devrait vérifier que Bob a bien reçu l\'argent', async () => {
      const res = await request(app).get('/mon-compte').set('Authorization', `Bearer ${tokenUser2}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.solde).toBe(300); // Bob a reçu 300
    });

    it('Ne devrait pas permettre un transfert vers son propre compte', async () => {
      const res = await request(app).post('/transfert').set('Authorization', `Bearer ${tokenUser1}`).send({
        montant: 100,
        compte_destination_id: idUser1 // Soi-même
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('4. Recherche et Historique', () => {
    it('Devrait lister tous les comptes', async () => {
      const res = await request(app).get('/comptes/').set('Authorization', `Bearer ${tokenUser1}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it('Devrait rechercher le compte de Bob', async () => {
      const res = await request(app).get('/recherche?q=bob').set('Authorization', `Bearer ${tokenUser1}`);
      expect(res.statusCode).toBe(200);
      expect(res.body[0].nom).toBe('Bob Martin');
    });

    it('Devrait afficher l\'historique des transactions d\'Alice', async () => {
      const res = await request(app).get('/transactions').set('Authorization', `Bearer ${tokenUser1}`);
      expect(res.statusCode).toBe(200);
      // Alice: Dépôt initial, Dépôt 500, Retrait 200, Transfert émis 300, Transfert reçu 300 = 5 transactions (le backend crée deux lignes)
      expect(res.body.length).toBe(5); 
    });
  });

  describe('5. Suppression de compte', () => {
    it('Ne devrait pas pouvoir supprimer avec un solde > 0', async () => {
      // Alice a 1000 FCFA
      const res = await request(app).delete(`/comptes/${idUser1}`).set('Authorization', `Bearer ${tokenUser1}`).send({
        confirmation: true,
        mot_de_passe: 'password123'
      });
      expect(res.statusCode).toBe(400);
    });

    it('Devrait vider le compte et le supprimer pour Bob', async () => {
      // Bob a 300 FCFA, on les retire
      await request(app).post('/retrait').set('Authorization', `Bearer ${tokenUser2}`).send({ montant: 300 });

      // Suppression
      const res = await request(app).delete(`/comptes/${idUser2}`).set('Authorization', `Bearer ${tokenUser2}`).send({
        confirmation: true,
        mot_de_passe: 'password456'
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('6. Cas d\'erreurs (Branches & Sécurité)', () => {
    it('Rejette accès sans token', async () => {
      const res = await request(app).get('/mon-compte');
      expect(res.statusCode).toBe(401);
    });

    it('Rejette accès avec token invalide', async () => {
      const res = await request(app).get('/mon-compte').set('Authorization', 'Bearer fake-token-123');
      expect(res.statusCode).toBe(401);
    });

    it('Rejette accès avec token d\'un compte supprimé', async () => {
      // Le compte Bob a été supprimé à l'étape 5, son token est donc orphelin
      const res = await request(app).get('/mon-compte').set('Authorization', `Bearer ${tokenUser2}`);
      expect(res.statusCode).toBe(401);
    });

    it('Rejette un dépôt de 0 FCFA', async () => {
      const res = await request(app).post('/depot').set('Authorization', `Bearer ${tokenUser1}`).send({ montant: 0 });
      expect(res.statusCode).toBe(400);
    });

    it('Rejette un retrait avec un montant <= 0', async () => {
      const res = await request(app).post('/retrait').set('Authorization', `Bearer ${tokenUser1}`).send({ montant: -50 });
      expect(res.statusCode).toBe(400);
    });

    it('Rejette un transfert avec un montant <= 0', async () => {
      const res = await request(app).post('/transfert').set('Authorization', `Bearer ${tokenUser1}`).send({ montant: 0, compte_destination_id: idUser2 });
      expect(res.statusCode).toBe(400);
    });

    it('Rejette un transfert vers un compte inexistant', async () => {
      const res = await request(app).post('/transfert').set('Authorization', `Bearer ${tokenUser1}`).send({ montant: 10, compte_destination_id: 'fake-id' });
      expect(res.statusCode).toBe(404);
    });
    
    it('Rejette une suppression si ce n\'est pas son propre compte', async () => {
      const res = await request(app).delete('/comptes/un-autre-id').set('Authorization', `Bearer ${tokenUser1}`).send({
        confirmation: true,
        mot_de_passe: 'password123'
      });
      expect(res.statusCode).toBe(403);
    });

    it('Rejette une suppression sans confirmation', async () => {
      const res = await request(app).delete(`/comptes/${idUser1}`).set('Authorization', `Bearer ${tokenUser1}`).send({
        mot_de_passe: 'password123'
      });
      expect(res.statusCode).toBe(400);
    });

    it('Rejette une suppression avec mauvais mot de passe', async () => {
      const res = await request(app).delete(`/comptes/${idUser1}`).set('Authorization', `Bearer ${tokenUser1}`).send({
        confirmation: true,
        mot_de_passe: 'wrongpassword'
      });
      expect(res.statusCode).toBe(401);
    });

    it('Rejette un solde initial négatif', async () => {
      const res = await request(app).post('/comptes/').send({
        nom: 'Test Negatif',
        email: 'negatif@test.com',
        code: '123',
        solde_initial: -100
      });
      expect(res.statusCode).toBe(400);
    });

    it('Rejette un transfert avec solde insuffisant', async () => {
      const res = await request(app).post('/transfert').set('Authorization', `Bearer ${tokenUser1}`).send({
        montant: 99999,
        compte_destination_id: 'fake-id'
      });
      expect(res.statusCode).toBe(400);
    });

    it('Devrait retourner la page d\'accueil', async () => {
      const res = await request(app).get('/');
      expect(res.statusCode).toBe(200);
    });
  });

});
