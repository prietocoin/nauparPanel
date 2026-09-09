const fs = require('fs');
const path = require('path');

// Cargar la configuración dinámica de NAUPAR
const configPath = process.env.NAUPAR_CONFIG_PATH || './naupar.config.json';
const config = JSON.parse(fs.readFileSync(path.resolve(configPath), 'utf8'));

/**
 * Calcula el monto final convertido aplicando reglas de país y matriz de factores.
 * @param {string} origen - Código de moneda de origen (ej: 'PEN')
 * @param {string} destino - Código de moneda de destino (ej: 'USD')
 * @param {number} monto - Cantidad enviada por el cliente
 * @param {number} tasaBase - Tasa de cambio base del mercado
 */
function calcularConversion(origen, destino, monto, tasaBase) {
  const reglaPais = config.reglas_operacion_pais[origen];
  let operacion = reglaPais ? reglaPais.operacion_defecto : 'MULTIPLICACION';

  // Validar excepciones
  if (reglaPais && reglaPais.excepciones) {
    for (const excepcion of reglaPais.excepciones) {
      if (excepcion.destinos.includes(destino)) {
        operacion = excepcion.operacion;
        break;
      }
    }
  }

  // Factor de ganancia según matriz
  const factor = (config.factores_ganancia[origen] && config.factores_ganancia[origen][destino]) || 1.0;

  // Ejecución de fórmula
  let resultadoBase = operacion === 'DIVISION' ? (monto / tasaBase) : (monto * tasaBase);
  let montoFinal = resultadoBase * factor;

  return {
    origen,
    destino,
    montoOrigen: Number(monto),
    tasaBase: Number(tasaBase),
    operacion,
    factorGanancia: factor,
    montoFinal: Number(montoFinal.toFixed(2))
  };
}

module.exports = { config, calcularConversion };
