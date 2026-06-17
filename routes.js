const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { Compte, Transaction } = require('./models');
const { hashPassword, verifyPassword, createAccessToken, authenticateToken } = require('./auth');

// Créer un compte
router.post('/comptes/', async (req, res) => {
  try {
    const { nom, email, code, solde_initial = 0.0 } = req.body;

    // Vérifier email unique
    const compteExistant = await Compte.findByEmail(email);
    if (compteExistant) {
      return res.status(400).json({ detail: 'Email déjà utilisé' });
    }

    // Valider solde initial
    if (solde_initial < 0) {
      return res.status(400).json({ detail: 'Le solde initial ne peut pas être négatif' });
    }

    const code_hash = await hashPassword(code);
    const id = uuidv4().substring(0, 8);
    const date_creation = new Date().toISOString();

    await Compte.create({
      id,
      nom,
      email,
      solde: solde_initial,
      date_creation,
      code_hash
    });

    // Créer transaction de dépôt initial si > 0
    if (solde_initial > 0) {
      await Transaction.create({
        id: uuidv4().substring(0, 8),
        type: 'depot',
        montant: solde_initial,
        date: new Date().toISOString(),
        description: 'Dépôt initial',
        compte_destination: id
      });
    }

    res.status(201).json({ id, nom, email, solde: solde_initial, date_creation });
  } catch (error) {
    console.error('ERREUR DANS CREATION COMPTE:', error);
    res.status(500).json({ detail: `Erreur serveur: ${error.message}` });
  }
});

// Connexion (token)
router.post('/token', async (req, res) => {
  try {
    const { username, password } = req.body;

    const compte = await Compte.findByEmail(username);
    
    if (!compte || !await verifyPassword(password, compte.code_hash)) {
      return res.status(401).json({ 
        detail: 'Email ou mot de passe incorrect',
        headers: { 'WWW-Authenticate': 'Bearer' }
      });
    }

    const access_token = createAccessToken({ sub: compte.email });
    res.json({ access_token, token_type: 'bearer' });
  } catch (error) {
    res.status(500).json({ detail: 'Erreur serveur' });
  }
});

// Liste des comptes (authentifié)
router.get('/comptes/', authenticateToken, async (req, res) => {
  try {
    const comptes = await Compte.findAll();
    res.json(comptes);
  } catch (error) {
    res.status(500).json({ detail: 'Erreur serveur' });
  }
});

// Mon compte
router.get('/mon-compte', authenticateToken, async (req, res) => {
  try {
    const { id, nom, email, solde, date_creation } = req.user;
    res.json({ id, nom, email, solde, date_creation });
  } catch (error) {
    res.status(500).json({ detail: 'Erreur serveur' });
  }
});

// Dépôt
router.post('/depot', authenticateToken, async (req, res) => {
  try {
    const { montant, description = 'Dépôt' } = req.body;

    if (montant <= 0) {
      return res.status(400).json({ detail: 'Le montant doit être positif' });
    }

    const nouveauSolde = req.user.solde + montant;
    await Compte.updateSolde(req.user.id, nouveauSolde);

    await Transaction.create({
      id: uuidv4().substring(0, 8),
      type: 'depot',
      montant,
      date: new Date().toISOString(),
      description,
      compte_destination: req.user.id
    });

    res.json({ 
      message: `Dépôt de ${montant} FCFA effectué`, 
      nouveau_solde: nouveauSolde 
    });
  } catch (error) {
    res.status(500).json({ detail: 'Erreur serveur' });
  }
});

// Retrait
router.post('/retrait', authenticateToken, async (req, res) => {
  try {
    const { montant, description = 'Retrait' } = req.body;

    if (montant <= 0) {
      return res.status(400).json({ detail: 'Le montant doit être positif' });
    }

    if (req.user.solde < montant) {
      return res.status(400).json({ detail: 'Solde insuffisant' });
    }

    const nouveauSolde = req.user.solde - montant;
    await Compte.updateSolde(req.user.id, nouveauSolde);

    await Transaction.create({
      id: uuidv4().substring(0, 8),
      type: 'retrait',
      montant,
      date: new Date().toISOString(),
      description,
      compte_source: req.user.id
    });

    res.json({ 
      message: `Retrait de ${montant} FCFA effectué`, 
      nouveau_solde: nouveauSolde 
    });
  } catch (error) {
    res.status(500).json({ detail: 'Erreur serveur' });
  }
});

// Transfert
router.post('/transfert', authenticateToken, async (req, res) => {
  try {
    const { montant, compte_destination_id, description = 'Transfert' } = req.body;

    if (montant <= 0) {
      return res.status(400).json({ detail: 'Le montant doit être positif' });
    }

    if (req.user.solde < montant) {
      return res.status(400).json({ detail: 'Solde insuffisant' });
    }

    const compteDest = await Compte.findById(compte_destination_id);
    if (!compteDest) {
      return res.status(404).json({ detail: 'Compte destination non trouvé' });
    }

    if (compteDest.id === req.user.id) {
      return res.status(400).json({ detail: 'Impossible de transférer vers son propre compte' });
    }

    // Effectuer le transfert
    const nouveauSoldeSource = req.user.solde - montant;
    const nouveauSoldeDest = compteDest.solde + montant;

    await Compte.updateSolde(req.user.id, nouveauSoldeSource);
    await Compte.updateSolde(compteDest.id, nouveauSoldeDest);

    // Créer les transactions
    await Transaction.create({
      id: uuidv4().substring(0, 8),
      type: 'transfert_emis',
      montant,
      date: new Date().toISOString(),
      description: `${description} vers ${compteDest.nom}`,
      compte_source: req.user.id,
      compte_destination: compteDest.id
    });

    await Transaction.create({
      id: uuidv4().substring(0, 8),
      type: 'transfert_recu',
      montant,
      date: new Date().toISOString(),
      description: `${description} de ${req.user.nom}`,
      compte_source: req.user.id,
      compte_destination: compteDest.id
    });

    res.json({ 
      message: `Transfert de ${montant} FCFA vers ${compteDest.nom} effectué`,
      nouveau_solde: nouveauSoldeSource
    });
  } catch (error) {
    res.status(500).json({ detail: 'Erreur serveur' });
  }
});

// Recherche de comptes
router.get('/recherche', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    const comptes = await Compte.search(q);
    res.json(comptes);
  } catch (error) {
    res.status(500).json({ detail: 'Erreur serveur' });
  }
});

// Historique des transactions
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const transactions = await Transaction.findByCompte(req.user.id);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ detail: 'Erreur serveur' });
  }
});

// Suppression de compte
router.delete('/comptes/:compte_id', authenticateToken, async (req, res) => {
  try {
    const { compte_id } = req.params;
    const { confirmation, mot_de_passe } = req.body;

    // Vérifier que l'utilisateur peut supprimer ce compte
    if (compte_id !== req.user.id) {
      return res.status(403).json({ detail: 'Vous ne pouvez supprimer que votre propre compte' });
    }

    // Vérifier la confirmation
    if (!confirmation) {
      return res.status(400).json({ detail: 'La confirmation est requise pour supprimer le compte' });
    }

    // Vérifier le mot de passe
    if (!await verifyPassword(mot_de_passe, req.user.code_hash)) {
      return res.status(401).json({ detail: 'Mot de passe incorrect' });
    }

    // Vérifier que le solde est zéro
    if (req.user.solde !== 0) {
      return res.status(400).json({ 
        detail: `Impossible de supprimer le compte avec un solde de ${req.user.solde} FCFA. Le solde doit être zéro.`
      });
    }

    // Supprimer les transactions associées
    await Transaction.deleteByCompte(compte_id);

    // Supprimer le compte
    await Compte.delete(compte_id);

    res.json({ message: 'Compte supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ detail: 'Erreur serveur' });
  }
});

module.exports = router;
