const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./routes');
const swaggerUi = require('swagger-ui-express');
const YAML = require('js-yaml');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers statiques du frontend
app.use('/frontend', express.static(path.join(__dirname, 'frontend')));

// Route racine pour servir le frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Routes API
app.use('/', routes);

// Documentation Swagger
const swaggerDocument = YAML.load(
  fs.readFileSync(path.join(__dirname, 'swagger.yaml'), 'utf8')
);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Gestion des erreurs
/* v8 ignore next 4 */
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ detail: 'Erreur serveur interne' });
});

// Démarrer le serveur uniquement si le fichier est exécuté directement
/* v8 ignore next 9 */
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n=================================`);
    console.log(`API Banque Node.js`);
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
    console.log(`Documentation: http://localhost:${PORT}/`);
    console.log(`=================================\n`);
  });
}

module.exports = app;
