const express = require('express');
const router = express.Router();
const { obtenerConfig, procesarCalculo } = require('../controllers/calculator.controller');
const { validarCalcular } = require('../middlewares/validate');

router.get('/config', obtenerConfig);
router.post('/calcular', validarCalcular, procesarCalculo);

module.exports = router;
