require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const { config, calcularConversion } = require('./calculator');

const app = express();
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const inicializarBD = async () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS registros (
      id SERIAL PRIMARY KEY,
      nombre_asesor VARCHAR(100),
      monto NUMERIC(15, 2),
      estado_proceso VARCHAR(50) DEFAULT 'PENDIENTE',
      tipo_operacion VARCHAR(50),
      hash_corto VARCHAR(20) UNIQUE,
      titular VARCHAR(150),
      moneda VARCHAR(10),
      tasa NUMERIC(15, 4),
      banco VARCHAR(100),
      hiperlink TEXT,
      fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_registros_hash ON registros(hash_corto);
    CREATE INDEX IF NOT EXISTS idx_registros_asesor ON registros(nombre_asesor);
  `;
  try {
    await pool.query(sql);
    console.log('✅ Base de datos conectada. Tabla "registros" verificada correctamente.');
  } catch (err) {
    console.error('❌ Error inicializando la tabla en PostgreSQL:', err.message);
  }
};

inicializarBD();

// Endpoint: Obtener configuración global
app.get('/api/config', (req, res) => {
  res.json(config);
});

// Endpoint: Calcular conversión según reglas del JSON
app.post('/api/calcular', (req, res) => {
  const { origen, destino, monto, tasaBase } = req.body;
  if (!origen || !destino || !monto || !tasaBase) {
    return res.status(400).json({ error: 'Parámetros requeridos: origen, destino, monto, tasaBase' });
  }

  try {
    const resultado = calcularConversion(origen, destino, monto, tasaBase);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: 'Error realizando el cálculo', detalle: error.message });
  }
});

// Endpoint: Guardar una operación en PostgreSQL
app.post('/api/registros', async (req, res) => {
  const { nombre_asesor, monto, tipo_operacion, titular, moneda, tasa, banco, hiperlink } = req.body;

  if (!monto || !moneda) {
    return res.status(400).json({ error: 'Los campos monto y moneda son obligatorios.' });
  }

  const hash_corto = crypto.randomBytes(4).toString('hex').toUpperCase();

  const query = `
    INSERT INTO registros (nombre_asesor, monto, tipo_operacion, hash_corto, titular, moneda, tasa, banco, hiperlink)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;
  `;

  try {
    const result = await pool.query(query, [
      nombre_asesor || 'SISTEMA',
      monto,
      tipo_operacion || 'ENVIO',
      hash_corto,
      titular || 'N/A',
      moneda,
      tasa || 1,
      banco || 'N/A',
      hiperlink || ''
    ]);
    res.status(201).json({ mensaje: 'Operación registrada con éxito', registro: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar la operación', detalle: error.message });
  }
});

// Endpoint: Consultar el historial de operaciones
app.get('/api/registros', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM registros ORDER BY fecha_hora DESC LIMIT 100;');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener registros', detalle: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`);
});
