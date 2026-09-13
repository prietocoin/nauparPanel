require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { inicializarBD } = require('./src/config/db');

// 1. Importación de Rutas
const calculatorRoutes = require('./src/routes/calculator.routes');
const recordsRoutes = require('./src/routes/records.routes');
const tasasRoutes = require('./src/routes/tasas.routes');

// 2. Inicialización de App Express
const app = express();

// 3. Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 4. Registro de Rutas
app.use('/api/tasas', tasasRoutes);
app.use('/api', calculatorRoutes);
app.use('/api', recordsRoutes);

// 5. Arranque de Base de Datos y Servidor
inicializarBD().then(() => {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.log(`🚀 Servidor modular NAUPAR ejecutándose en puerto ${PORT}`);
  });
}).catch((err) => {
  console.error('❌ Error fatal al inicializar la base de datos:', err.message);
});
