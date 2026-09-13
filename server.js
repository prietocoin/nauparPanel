require('dotenv').config();
const express = require('express');
const { inicializarBD } = require('./src/config/db');

// Importación de Rutas
const calculatorRoutes = require('./src/routes/calculator.routes');
const recordsRoutes = require('./src/routes/records.routes');
const tasasRoutes = require('./src/routes/tasas.routes');

// Inicialización de App Express
const app = express();

// Configuración de CORS nativo (sin librerías externas)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static('public'));

// Registro de Rutas
app.use('/api/tasas', tasasRoutes);
app.use('/api', calculatorRoutes);
app.use('/api', recordsRoutes);

// Arranque
inicializarBD().then(() => {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.log(`🚀 Servidor modular NAUPAR ejecutándose en puerto ${PORT}`);
  });
}).catch((err) => {
  console.error('❌ Error al inicializar la BD:', err.message);
});
