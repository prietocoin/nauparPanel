// src/routes/records.routes.js
const express = require('express');
const router = express.Router();
const { crearRegistro, listarRegistros, obtenerTablaGenerica } = require('../controllers/records.controller');
const { validarRegistro } = require('../middlewares/validate');

router.post('/registros', validarRegistro, crearRegistro);
router.get('/registros', listarRegistros);
router.get('/remesas', listarRegistros);
router.get('/tabla/:nombre', obtenerTablaGenerica); // Soporte para vista_pares, cola_recepcion, etc.

module.exports = router;
