const express = require('express');
const router = express.Router();
const { crearRegistro, listarRegistros } = require('../controllers/records.controller');
const { validarRegistro } = require('../middlewares/validate');

router.post('/registros', validarRegistro, crearRegistro);
router.get('/registros', listarRegistros);
router.get('/remesas', listarRegistros);

module.exports = router;
