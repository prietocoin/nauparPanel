const { pool } = require('../config/db');
const crypto = require('crypto');

async function guardarRegistroConReintento(datos, intentosMaximos = 3) {
  const { nombre_asesor, monto, tipo_operacion, titular, moneda, tasa, banco, hiperlink } = datos;

  for (let intento = 1; intento <= intentosMaximos; intento++) {
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
      return result.rows[0];
    } catch (error) {
      if (error.code === '23505' && intento < intentosMaximos) {
        console.warn(`⚠️ Colisión de hash_corto (${hash_corto}). Reintentando (${intento}/${intentosMaximos})...`);
        continue;
      }
      throw error;
    }
  }
}

async function obtenerRegistrosFiltrados({ asesor, fechaInicio, fechaFin, hash }) {
  let query = `SELECT * FROM registros WHERE 1=1`;
  let params = [];

  if (asesor) {
    params.push(asesor);
    query += ` AND nombre_asesor = $${params.length}`;
  }
  if (fechaInicio) {
    params.push(`${fechaInicio} 00:00:00`);
    query += ` AND created_at >= $${params.length}`;
  }
  if (fechaFin) {
    params.push(`${fechaFin} 23:59:59`);
    query += ` AND created_at <= $${params.length}`;
  }
  if (hash) {
    params.push(hash);
    query += ` AND hash_corto = $${params.length}`;
  }

  query += ' ORDER BY id DESC LIMIT 200';
  const { rows } = await pool.query(query, params);
  return rows;
}

module.exports = { guardarRegistroConReintento, obtenerRegistrosFiltrados };
