const { z } = require('zod');

const calcularSchema = z.object({
  origen: z.string().min(2).max(10),
  destino: z.string().min(2).max(10),
  monto: z.number().positive(),
  tasaBase: z.number().positive(),
});

const registroSchema = z.object({
  nombre_asesor: z.string().optional(),
  monto: z.union([z.number(), z.string()]).transform((val) => Number(val)),
  tipo_operacion: z.string().optional(),
  titular: z.string().optional(),
  moneda: z.string().min(2).max(10),
  tasa: z.union([z.number(), z.string()]).optional().transform((val) => Number(val || 1)),
  banco: z.string().optional(),
  hiperlink: z.string().optional(),
});

const validarCalcular = (req, res, next) => {
  const result = calcularSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Payload de cálculo inválido', detalles: result.error.errors });
  }
  req.body = result.data;
  next();
};

const validarRegistro = (req, res, next) => {
  const result = registroSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Payload de registro inválido', detalles: result.error.errors });
  }
  req.body = result.data;
  next();
};

module.exports = { validarCalcular, validarRegistro };
