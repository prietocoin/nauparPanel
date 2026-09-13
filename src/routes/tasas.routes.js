const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Obtener la instancia real de query/pool según la exportación de db.js
const pool = db.pool || db;

let borradorTasasNaupar = {};

// Inicialización de esquema independiente para NAUPAR
async function initTasasSchema() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS naupar_mercado_tasas (
        id SERIAL PRIMARY KEY,
        id_tasa VARCHAR(20) NOT NULL,
        moneda VARCHAR(10) NOT NULL,
        tasa_base NUMERIC(18, 6) NOT NULL,
        timestamp BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS naupar_notificaciones_tasas (
        id SERIAL PRIMARY KEY,
        id_tasa VARCHAR(50) NOT NULL,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_naupar_mercado_tasas_id ON naupar_mercado_tasas(id_tasa);
      CREATE INDEX IF NOT EXISTS idx_naupar_mercado_tasas_ts ON naupar_mercado_tasas(timestamp ASC);
    `);
    console.log('✅ Tablas independientes naupar_mercado_tasas verificadas.');
  } catch (err) {
    console.error('⚠️ Error al inicializar tablas de tasas NAUPAR:', err.message);
  }
}
initTasasSchema();

// GET /api/tasas/ultimas
router.get('/ultimas', async (req, res) => {
  try {
    const lastLotRes = await pool.query(`
      SELECT id_tasa FROM naupar_mercado_tasas ORDER BY timestamp DESC, id DESC LIMIT 1;
    `);

    if (lastLotRes.rows.length === 0) {
      return res.json({ id_tasa: 'T001', tasas: { USD: 1.0, USDT: 1.0, PEN: 3.75, COP: 3900 } });
    }

    const lastIdTasa = lastLotRes.rows[0].id_tasa;
    const ratesRes = await pool.query(
      `SELECT moneda, tasa_base FROM naupar_mercado_tasas WHERE id_tasa = $1;`,
      [lastIdTasa]
    );

    const tasasObj = { USD: 1.0, USDT: 1.0 };
    ratesRes.rows.forEach(r => {
      tasasObj[r.moneda.toUpperCase()] = parseFloat(r.tasa_base);
    });

    res.json({ id_tasa: lastIdTasa, tasas: tasasObj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasas/n8n-webhook
router.post('/n8n-webhook', (req, res) => {
  try {
    let payload = req.body;
    if (Array.isArray(payload)) payload = payload[0] || {};
    if (payload.json) payload = payload.json;

    borradorTasasNaupar = payload;
    return res.json({ success: true, message: 'Borrador NAUPAR cargado', rates: borradorTasasNaupar });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/tasas/fetch-hoo
router.get('/fetch-hoo', (req, res) => {
  if (!borradorTasasNaupar || Object.keys(borradorTasasNaupar).length === 0) {
    return res.status(404).json({ success: false, msg: 'Sin borrador en memoria para NAUPAR.' });
  }
  return res.json({ success: true, rates: borradorTasasNaupar });
});

// POST /api/tasas/publicar
router.post('/publicar', async (req, res) => {
  try {
    const { id_tasa, tasas } = req.body;
    const timestamp = Math.floor(Date.now() / 1000);

    if (!tasas || Object.keys(tasas).length === 0) {
      return res.status(400).json({ success: false, message: 'No se enviaron tasas.' });
    }

    let codigoTasa = id_tasa;
    if (!codigoTasa) {
      const lastRes = await pool.query("SELECT id_tasa FROM naupar_mercado_tasas ORDER BY id DESC LIMIT 1;");
      if (lastRes.rows.length > 0) {
        const lastLot = lastRes.rows[0].id_tasa;
        const match = lastLot.match(/\d+/);
        const num = match ? parseInt(match[0], 10) + 1 : 1;
        codigoTasa = `T${String(num).padStart(3, '0')}`;
      } else {
        codigoTasa = 'T001';
      }
    }

    for (const [moneda, valor] of Object.entries(tasas)) {
      if (valor && !isNaN(valor)) {
        await pool.query(
          `INSERT INTO naupar_mercado_tasas (id_tasa, moneda, tasa_base, timestamp) VALUES ($1, $2, $3, $4);`,
          [codigoTasa, moneda.toUpperCase(), parseFloat(valor), timestamp]
        );
      }
    }

    await pool.query(`INSERT INTO naupar_notificaciones_tasas (id_tasa) VALUES ($1);`, [codigoTasa]);

    res.json({ success: true, id_tasa: codigoTasa, message: `Tasa ${codigoTasa} publicada correctamente` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tasas/reenviar
router.post('/reenviar', async (req, res) => {
  try {
    const { id_tasa } = req.body;
    let codigoTasa = id_tasa;

    if (!codigoTasa) {
      const lastRes = await pool.query("SELECT id_tasa FROM naupar_mercado_tasas ORDER BY id DESC LIMIT 1;");
      if (lastRes.rows.length === 0) return res.status(400).json({ success: false, message: 'Sin tasas registradas.' });
      codigoTasa = lastRes.rows[0].id_tasa;
    }

    await pool.query(`INSERT INTO naupar_notificaciones_tasas (id_tasa) VALUES ($1);`, [codigoTasa]);
    res.json({ success: true, id_tasa: codigoTasa, message: `Reenvío activado para la tasa ${codigoTasa}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
