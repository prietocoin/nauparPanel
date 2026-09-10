require('dotenv').config();
const express = require('express');
const { inicializarBD } = require('./src/config/db');
const calculatorRoutes = require('./src/routes/calculator.routes');
const recordsRoutes = require('./src/routes/records.routes');

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
