const { obtenerConfiguracion } = require('../config/configLoader');

function calcularConversion(origen, destino, monto, tasaBase) {
  const config = obtenerConfiguracion();
  const reglaPais = config.reglas_operacion_pais[origen];
  let operacion = reglaPais ? reglaPais.operacion_defecto : 'MULTIPLICACION';

  if (reglaPais && reglaPais.excepciones) {
    for (const excepcion of reglaPais.excepciones) {
      if (excepcion.destinos.includes(destino)) {
        operacion = excepcion.operacion;
        break;
      }
    }
  }

  const factor = (config.factores_ganancia[origen] && config.factores_ganancia[origen][destino]) || 1.0;
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

module.exports = { calcularConversion };
