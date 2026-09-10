const fs = require('fs');
const path = require('path');

const configPath = process.env.NAUPAR_CONFIG_PATH || './naupar.config.json';
let cachedConfig = null;

function obtenerConfiguracion() {
  if (!cachedConfig) {
    const rawData = fs.readFileSync(path.resolve(configPath), 'utf8');
    cachedConfig = JSON.parse(rawData);
  }
  return cachedConfig;
}

fs.watch(path.resolve(configPath), (eventType) => {
  if (eventType === 'change') {
    try {
      const rawData = fs.readFileSync(path.resolve(configPath), 'utf8');
      cachedConfig = JSON.parse(rawData);
      console.log('🔄 naupar.config.json recargado en caliente correctamente.');
    } catch (err) {
      console.error('⚠️ Error al recargar naupar.config.json:', err.message);
    }
  }
});

module.exports = { obtenerConfiguracion };
