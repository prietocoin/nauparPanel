require('dotenv').config();
const express = require('express');
const { inicializarBD } = require('./src/config/db');
const calculatorRoutes = require('./src/routes/calculator.routes');
const recordsRoutes = require('./src/routes/records.routes');
const tasasRoutes = require('./src/routes/tasas.routes');
const express = require('express');
const cors = require('cors');

// 1. Inicializar app PRIMERO
const app = express();

app.use(cors());
app.use(express.json());

// 2. Importar y usar las rutas DESPUÉS de declarar app
const tasasRoutes = require('./src/routes/tasas.routes');
app.use('/api/tasas', tasasRoutes);

// Agrega la ruta junto a tus otras declaraciones app.use('/api/...')
app.use('/api/tasas', tasasRoutes);
const app = express();
app.use(express.json());
app.use(express.static('public'));

app.use('/api', calculatorRoutes);
app.use('/api', recordsRoutes);

inicializarBD().then(() => {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.log(`🚀 Servidor modular NAUPAR ejecutándose en puerto ${PORT}`);
  });
});
