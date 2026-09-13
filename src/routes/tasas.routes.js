const express = require('express');
const router = express.Router();
const db = require('../config/db');

const pool = db.pool || db;

// Inicialización de tablas independientes en PostgreSQL
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

      -- Tabla de borrador persistente en PostgreSQL (Sin Google Sheets ni RAM)
      CREATE TABLE IF NOT EXISTS naupar_borrador_tasas (
        moneda VARCHAR(10) PRIMARY KEY,
        tasa_base NUMERIC(18, 6) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_naupar_mercado_tasas_id ON naupar_mercado_tasas(id_tasa);
      CREATE INDEX IF NOT EXISTS idx_naupar_mercado_tasas_ts ON naupar_mercado_tasas(timestamp ASC);
    `);
    console.log('✅ Tablas PostgreSQL de NAUPAR (mercado, borrador y notificaciones) verificadas.');
  } catch (err) {
    console.error('⚠️ Error al inicializar tablas en PostgreSQL:', err.message);
  }
}
initTasasSchema();

// 1. GET: Últimas tasas oficiales en producción
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

// 2. POST: Webhook n8n -> Procesa WhatsApp / JSON y guarda en PostgreSQL
router.post('/n8n-webhook', async (req, res) => {
  try {
    let payload = req.body;
    if (Array.isArray(payload)) payload = payload[0] || {};
    if (payload.json) payload = payload.json;

    let ratesObj = {};

    if (payload.rates) {
      ratesObj = payload.rates;
    } else if (typeof payload === 'object' && !payload.conversation && !payload.message) {
      ratesObj = payload;
    }

    // Procesa directamente el texto enviado por WhatsApp (Ejemplo: Regex_945_3,35_3120...)
    const textoMsg = payload.conversation || payload.message?.conversation || payload.text || '';
    if (textoMsg.includes('Regex_')) {
      const partes = textoMsg.split('Regex_')[1].split('_');
      const ordenMonedas = ['CLP', 'PEN', 'COP', 'USD', 'MXN', 'ECU', 'VES', 'EUR', 'ARS', 'PYG', 'DBCV', 'EBCV', 'USDT'];
      partes.forEach((val, idx) => {
        if (ordenMonedas[idx] && val) {
          const numParsed = parseFloat(val.replace(',', '.'));
          if (!isNaN(numParsed)) ratesObj[ordenMonedas[idx]] = numParsed;
        }
      });
    }

    if (Object.keys(ratesObj).length === 0) {
      return res.status(400).json({ success: false, message: 'No se encontraron tasas procesables.' });
    }

    // Guarda o actualiza en naupar_borrador_tasas (PostgreSQL)
    for (const [moneda, valor] of Object.entries(ratesObj)) {
      if (valor !== null && valor !== undefined && !isNaN(parseFloat(valor))) {
        await pool.query(`
          INSERT INTO naupar_borrador_tasas (moneda, tasa_base, updated_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP)
          ON CONFLICT (moneda) 
          DO UPDATE SET tasa_base = EXCLUDED.tasa_base, updated_at = CURRENT_TIMESTAMP;
        `, [moneda.toUpperCase(), parseFloat(valor)]);
      }
    }

    return res.json({ success: true, message: 'Borrador guardado exitosamente en PostgreSQL', rates: ratesObj });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. GET: Obtener borrador directamente desde PostgreSQL
router.get('/fetch-hoo', async (req, res) => {
  try {
    const rowsRes = await pool.query(`SELECT moneda, tasa_base FROM naupar_borrador_tasas;`);
    
    if (rowsRes.rows.length === 0) {
      return res.status(404).json({ success: false, msg: 'Sin borrador en la base de datos PostgreSQL.' });
    }

    const ratesObj = {};
    rowsRes.rows.forEach(r => {
      ratesObj[r.moneda.toUpperCase()] = parseFloat(r.tasa_base);
    });

    return res.json({ success: true, rates: ratesObj });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. POST: Publicar Borrador a Lote Oficial en PostgreSQL
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
      if (valor !== null && valor !== undefined && !isNaN(parseFloat(valor))) {
        await pool.query(
          `INSERT INTO naupar_mercado_tasas (id_tasa, moneda, tasa_base, timestamp) VALUES ($1, $2, $3, $4);`,
          [codigoTasa, moneda.toUpperCase(), parseFloat(valor), timestamp]
        );
      }
    }

    await pool.query(`INSERT INTO naupar_notificaciones_tasas (id_tasa) VALUES ($1);`, [codigoTasa]);

    res.json({ success: true, id_tasa: codigoTasa, message: `Tasa ${codigoTasa} publicada en PostgreSQL` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. POST: Reenviar notificación de lote
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
