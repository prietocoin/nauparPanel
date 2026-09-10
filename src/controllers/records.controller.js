const { guardarRegistroConReintento, obtenerRegistrosFiltrados } = require('../services/records.service');

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

module.exports = { crearRegistro, listarRegistros };
