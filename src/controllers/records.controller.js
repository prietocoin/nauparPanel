// src/controllers/records.controller.js
const { guardarRegistroConReintento, obtenerRegistrosFiltrados, consultarTabla } = require('../services/records.service');

const crearRegistro = async (req, res) => {
  try {
    const registro = await guardarRegistroConReintento(req.body);
    res.status(201).json({ mensaje: 'Operación registrada con éxito', registro });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar la operación', detalle: error.message });
  }
};

const listarRegistros = async (req, res) => {
  try {
    const registros = await obtenerRegistrosFiltrados(req.query);
    res.json(registros);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener registros', detalle: error.message });
  }
};

const obtenerTablaGenerica = async (req, res) => {
  const tablasPermitidas = ['registros', 'cola_recepcion', 'vista_pares', 'tasas_mercado', 't_nombres'];
  const { nombre } = req.params;
  if (!tablasPermitidas.includes(nombre)) {
    return res.status(403).json({ error: 'Tabla no autorizada para consulta' });
  }
  try {
    const datos = await consultarTabla(nombre);
    res.json(datos);
  } catch (error) {
    res.status(500).json({ error: `Error al consultar ${nombre}`, detalle: error.message });
  }
};

module.exports = { crearRegistro, listarRegistros, obtenerTablaGenerica };
