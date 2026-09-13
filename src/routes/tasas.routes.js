const express = require('express');
const router = express.Router();
const db = require('../config/db');

const pool = db.pool || db;

// 1. Inicialización de tablas en PostgreSQL
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

      CREATE TABLE IF NOT EXISTS naupar_factores_matriz (
        moneda_origen VARCHAR(10) NOT NULL,
        moneda_destino VARCHAR(10) NOT NULL,
        factor NUMERIC(6, 4) NOT NULL DEFAULT 0.9000,
        PRIMARY KEY (moneda_origen, moneda_destino)
      );

      CREATE INDEX IF NOT EXISTS idx_naupar_mercado_tasas_id ON naupar_mercado_tasas(id_tasa);
      CREATE INDEX IF NOT EXISTS idx_naupar_mercado_tasas_ts ON naupar_mercado_tasas(timestamp ASC);
    `);
    console.log('✅ Tablas independientes de NAUPAR y Factores verificadas en PostgreSQL.');
  } catch (err) {
    console.error('⚠️ Error al inicializar tablas NAUPAR:', err.message);
  }
}
initTasasSchema();

// 2. GET /api/tasas/ultimas -> Tasas oficiales activas en producción
router.get('/ultimas', async (req, res) => {
  try {
    const lastLotRes = await pool.query(`
      SELECT id_tasa FROM naupar_mercado_tasas 
      WHERE id_tasa != 'BORRADOR' 
      ORDER BY timestamp DESC, id DESC LIMIT 1;
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

// 3. POST /api/tasas/n8n-webhook -> Guarda en PostgreSQL con id_tasa = 'BORRADOR'
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

    // Decodifica mensajes de WhatsApp tipo Regex_
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
      return res.status(400).json({ success: false, message: 'No se procesaron tasas válidas.' });
    }

    const timestamp = Math.floor(Date.now() / 1000);

    // Reemplaza el borrador anterior en la BD
    await pool.query("DELETE FROM naupar_mercado_tasas WHERE id_tasa = 'BORRADOR';");

    for (const [moneda, valor] of Object.entries(ratesObj)) {
      if (valor !== null && valor !== undefined && !isNaN(parseFloat(valor))) {
        await pool.query(
          `INSERT INTO naupar_mercado_tasas (id_tasa, moneda, tasa_base, timestamp) VALUES ('BORRADOR', $1, $2, $3);`,
          [moneda.toUpperCase(), parseFloat(valor), timestamp]
        );
      }
    }

    return res.json({ success: true, message: 'Borrador guardado en PostgreSQL', rates: ratesObj });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. GET /api/tasas/fetch-hoo -> Consulta el borrador persistente en PostgreSQL
router.get('/fetch-hoo', async (req, res) => {
  try {
    const ratesRes = await pool.query(
      `SELECT moneda, tasa_base FROM naupar_mercado_tasas WHERE id_tasa = 'BORRADOR';`
    );

    if (ratesRes.rows.length === 0) {
      return res.status(404).json({ success: false, msg: 'Sin borrador pendiente en la base de datos.' });
    }

    const ratesObj = {};
    ratesRes.rows.forEach(r => {
      ratesObj[r.moneda.toUpperCase()] = parseFloat(r.tasa_base);
    });

    return res.json({ success: true, rates: ratesObj });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5. GET /api/tasas/factores -> Carga la matriz completa de factores
router.get('/factores', async (req, res) => {
  try {
    const result = await pool.query('SELECT moneda_origen, moneda_destino, factor FROM naupar_factores_matriz;');
    const matriz = {};
    result.rows.forEach(r => {
      if (!matriz[r.moneda_origen]) matriz[r.moneda_origen] = {};
      matriz[r.moneda_origen][r.moneda_destino] = parseFloat(r.factor);
    });
    res.json({ success: true, factores: matriz });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. POST /api/tasas/factores -> Guarda cambios de factores por moneda origen
router.post('/factores', async (req, res) => {
  try {
    const { moneda_origen, factores } = req.body;
    if (!moneda_origen || !factores) {
      return res.status(400).json({ success: false, message: 'Faltan parámetros requeridos.' });
    }

    for (const [destino, val] of Object.entries(factores)) {
      await pool.query(`
        INSERT INTO naupar_factores_matriz (moneda_origen, moneda_destino, factor)
        VALUES ($1, $2, $3)
        ON CONFLICT (moneda_origen, moneda_destino) DO UPDATE SET factor = EXCLUDED.factor;
      `, [moneda_origen.toUpperCase(), destino.toUpperCase(), parseFloat(val)]);
    }
    res.json({ success: true, message: `Factores para ${moneda_origen} actualizados.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. POST /api/tasas/publicar -> Emite el lote oficial (T001, T002...)
router.post('/publicar', async (req, res) => {
  try {
    const { id_tasa, tasas } = req.body;
    const timestamp = Math.floor(Date.now() / 1000);

    if (!tasas || Object.keys(tasas).length === 0) {
      return res.status(400).json({ success: false, message: 'No se enviaron tasas.' });
    }

    let codigoTasa = id_tasa;
    if (!codigoTasa) {
      const lastRes = await pool.query(
        "SELECT id_tasa FROM naupar_mercado_tasas WHERE id_tasa != 'BORRADOR' ORDER BY id DESC LIMIT 1;"
      );
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

    // Limpia el borrador procesado y notifica
    await pool.query("DELETE FROM naupar_mercado_tasas WHERE id_tasa = 'BORRADOR';");
    await pool.query(`INSERT INTO naupar_notificaciones_tasas (id_tasa) VALUES ($1);`, [codigoTasa]);

    res.json({ success: true, id_tasa: codigoTasa, message: `Tasa ${codigoTasa} publicada correctamente` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. POST /api/tasas/reenviar
router.post('/reenviar', async (req, res) => {
  try {
    const { id_tasa } = req.body;
    let codigoTasa = id_tasa;

    if (!codigoTasa) {
      const lastRes = await pool.query(
        "SELECT id_tasa FROM naupar_mercado_tasas WHERE id_tasa != 'BORRADOR' ORDER BY id DESC LIMIT 1;"
      );
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
