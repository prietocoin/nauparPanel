const express = require('express');
const router = express.Router();
const db = require('../config/db');

const pool = db.pool || db;

// Inicializador automático de tablas NAUPAR en PostgreSQL
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
  } catch (err) {
    console.error('⚠️ Error al inicializar tablas NAUPAR:', err.message);
  }
}
initTasasSchema();

// 1. GET /api/tasas/imagenes -> Mapeo directo de registros_raw
router.get('/imagenes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        hash_corto,
        hash_largo,
        grupo_raw,
        usuario_raw,
        nombre_push,
        caption,
        url_imagen,
        timestamp_msg,
        instancia,
        estado
      FROM registros_raw 
      ORDER BY timestamp_msg DESC NULLS LAST
      LIMIT 100;
    `);

    const imagenes = result.rows.map(row => ({
      id: row.hash_corto || row.hash_largo,
      hash: row.hash_corto,
      fecha: row.timestamp_msg,
      remitente: row.nombre_push || row.usuario_raw || 'Inversiones NAUPAR',
      remotejid: row.grupo_raw || 'Privado',
      caption: row.caption || 'Sin texto...',
      url: row.url_imagen || ''
    }));

    res.json(imagenes);
  } catch (err) {
    console.error('⚠️ Error consultando registros_raw:', err.message);
    res.status(500).json({ error: err.message, imagenes: [] });
  }
});

// 2. GET /api/tasas/fetch-binance -> Extracción P2P exclusiva para las 13 monedas de NAUPAR
router.get('/fetch-binance', async (req, res) => {
  try {
    const fiatsP2P = ['CLP', 'PEN', 'COP', 'MXN', 'VES', 'EUR', 'ARS', 'PYG'];

    const ratesObj = {
      USD: 1.0,
      USDT: 1.0,
      CLP: 0,
      PEN: 0,
      COP: 0,
      MXN: 0,
      ECU: 1.0,
      VES: 0,
      EUR: 0,
      ARS: 0,
      PYG: 0,
      DBCV: '',
      EBCV: ''
    };

    await Promise.all(fiatsP2P.map(async (fiat) => {
      try {
        const response = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' 
          },
          body: JSON.stringify({ 
            page: 1, 
            rows: 1, 
            asset: 'USDT', 
            tradeType: 'BUY', 
            fiat: fiat 
          })
        });

        const data = await response.json();
        if (data?.data?.[0]?.adv?.price) {
          ratesObj[fiat] = parseFloat(data.data[0].adv.price);
        }
      } catch (e) {
        console.error(`⚠️ Falló obtención de ${fiat} en Binance:`, e.message);
      }
    }));

    res.json({ success: true, rates: ratesObj });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. GET /api/tasas/ultimas -> Tasas activas en producción
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

// 4. GET & POST /api/tasas/factores
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

router.post('/factores', async (req, res) => {
  try {
    const { moneda_origen, factores } = req.body;
    for (const [destino, val] of Object.entries(factores)) {
      await pool.query(`
        INSERT INTO naupar_factores_matriz (moneda_origen, moneda_destino, factor)
        VALUES ($1, $2, $3)
        ON CONFLICT (moneda_origen, moneda_destino) DO UPDATE SET factor = EXCLUDED.factor;
      `, [moneda_origen.toUpperCase(), destino.toUpperCase(), parseFloat(val)]);
    }
    res.json({ success: true, message: `Factores actualizados.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. POST /api/tasas/publicar -> Publica lote y activa trigger de n8n
router.post('/publicar', async (req, res) => {
  try {
    const { id_tasa, tasas } = req.body;
    const timestamp = Math.floor(Date.now() / 1000);

    let codigoTasa = id_tasa;
    if (!codigoTasa) {
      const lastRes = await pool.query("SELECT id_tasa FROM naupar_mercado_tasas WHERE id_tasa != 'BORRADOR' ORDER BY id DESC LIMIT 1;");
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

    // Disparador directo para n8n
    await pool.query(`INSERT INTO naupar_notificaciones_tasas (id_tasa) VALUES ($1);`, [codigoTasa]);
    
    res.json({ success: true, id_tasa: codigoTasa, message: `Tasa ${codigoTasa} publicada` });
  } catch (err) {
    console.error('⚠️ Error al publicar tasa:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. POST /api/tasas/reenviar -> Notifica nuevamente a n8n
router.post('/reenviar', async (req, res) => {
  try {
    const lastRes = await pool.query("SELECT id_tasa FROM naupar_mercado_tasas WHERE id_tasa != 'BORRADOR' ORDER BY id DESC LIMIT 1;");
    const codigoTasa = lastRes.rows[0]?.id_tasa || 'T001';
    
    await pool.query(`INSERT INTO naupar_notificaciones_tasas (id_tasa) VALUES ($1);`, [codigoTasa]);
    
    res.json({ success: true, id_tasa: codigoTasa, message: `Reenvío activado para ${codigoTasa}` });
  } catch (err) {
    console.error('⚠️ Error al reenviar tasa:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
