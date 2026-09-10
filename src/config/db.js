const { Pool } = require('pg');

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
    CREATE INDEX IF NOT EXISTS idx_registros_created_at ON registros(created_at);
  `;
  try {
    await pool.query(sql);
    console.log('✅ Base de datos conectada. Tabla e índices B-Tree verificados.');
  } catch (err) {
    console.error('❌ Error inicializando la base de datos:', err.message);
  }
};

module.exports = { pool, inicializarBD };
