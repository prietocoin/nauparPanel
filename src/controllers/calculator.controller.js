const { obtenerConfiguracion } = require('../config/configLoader');
const { calcularConversion } = require('../services/calculator.service');

const obtenerConfig = (req, res) => {
  res.json(obtenerConfiguracion());
};

const procesarCalculo = (req, res) => {
  try {
    const { origen, destino, monto, tasaBase } = req.body;
    const resultado = calcularConversion(origen, destino, monto, tasaBase);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: 'Error realizando el cálculo', detalle: error.message });
  }
};

module.exports = { obtenerConfig, procesarCalculo };
