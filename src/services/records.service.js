async function consultarTabla(nombreTabla) {
  const { rows } = await pool.query(`SELECT * FROM ${nombreTabla} ORDER BY 1 DESC LIMIT 100;`);
  return rows;
}
