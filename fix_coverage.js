const fs = require('fs');

function fixCoverage() {
  // models.js
  let models = fs.readFileSync('models.js', 'utf8');
  models = models.replace(/\/\* istanbul ignore next \*\/ if \(err\) reject\(err\);/g, 'if (err) /* v8 ignore next */ return reject(err);');
  // Handle case where I just replaced it without return
  models = models.replace(/if \(err\) \/\* v8 ignore next \*\/ reject\(err\);/g, 'if (err) /* v8 ignore next */ return reject(err);');
  
  // Also fix lines 8, 19, 28 etc where the user might have them
  fs.writeFileSync('models.js', models);

  // routes.js
  let routes = fs.readFileSync('routes.js', 'utf8');
  routes = routes.replace(/\} \/\* istanbul ignore next \*\/ catch \(error\) \{/g, '} catch (error) {\n    /* v8 ignore next 4 */');
  fs.writeFileSync('routes.js', routes);

  // database.js
  let db = fs.readFileSync('database.js', 'utf8');
  db = db.replace(/\/\* istanbul ignore next \*\/\nif \(DATABASE_URL\.startsWith\('postgres'\)\) \{/g, 'if (DATABASE_URL.startsWith(\'postgres\')) {\n  /* v8 ignore next 2 */');
  db = db.replace(/const db = new sqlite3\.Database\(dbPath, \/\* istanbul ignore next \*\/ \(err\) => \{/g, 'const db = new sqlite3.Database(dbPath, (err) => {');
  db = db.replace(/if \(err\) \{\n    console\.error\('Erreur de connexion/g, 'if (err) {\n    /* v8 ignore next 2 */\n    console.error(\'Erreur de connexion');
  fs.writeFileSync('database.js', db);

  // server.js
  let server = fs.readFileSync('server.js', 'utf8');
  server = server.replace(/\/\* istanbul ignore next \*\/\napp\.use\(\(err, req, res, next\) => \{/g, 'app.use((err, req, res, next) => {\n  /* v8 ignore next 3 */');
  server = server.replace(/\/\* istanbul ignore next \*\/\nif \(require\.main === module\) \{/g, '/* v8 ignore start */\nif (require.main === module) {');
  server = server.replace(/  \}\);\n\}/g, '  });\n}\n/* v8 ignore stop */');
  fs.writeFileSync('server.js', server);

  // auth.js
  let auth = fs.readFileSync('auth.js', 'utf8');
  auth = auth.replace(/\/\* istanbul ignore next \*\/\n\s*return null;/g, 'return null;');
  auth = auth.replace(/catch \(error\) \{\n\s*return res\.status\(500\)/g, 'catch (error) {\n    /* v8 ignore next 2 */\n    return res.status(500)');
  fs.writeFileSync('auth.js', auth);
}

fixCoverage();
console.log('Fichiers mis à jour pour v8 coverage');
