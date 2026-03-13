/**
 * src/web/routes/route-helpers.js
 *
 * Funções auxiliares para os roteadores Express.
 */
'use strict';

/**
 * Envia uma resposta de sucesso (200 OK).
 * @param {object} res - O objeto de resposta do Express.
 * @param {any} [data] - Os dados a serem enviados no corpo da resposta.
 */
function ok(res, data) {
  res.json({ success: true, data });
}

/**
 * Envia uma resposta de erro.
 * @param {object} res - O objeto de resposta do Express.
 * @param {string|Error} error - A mensagem de erro ou o objeto de erro.
 * @param {number} [status=400] - O código de status HTTP.
 */
function fail(res, error, status = 400) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  res.status(status).json({ success: false, error: errorMessage });
}

/**
 * Converte um valor para um inteiro positivo. Retorna null se inválido.
 * @param {any} v - O valor a ser convertido.
 * @returns {number|null}
 */
function intParam(v) {
  if (v === null || v === undefined) return null;
  const n = parseInt(v, 10);
  // Retorna nulo para 0, negativos, ou não-números.
  return Number.isFinite(n) && n > 0 ? n : null;
}

module.exports = {
  ok,
  fail,
  intParam,
};