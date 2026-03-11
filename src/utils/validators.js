/**
 * Validadores para sanitização de entrada.
 */

/**
 * Valida se uma string não está vazia ou é apenas espaços em branco.
 */
function isValidString(value, minLength = 1, maxLength = 255) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length >= minLength && trimmed.length <= maxLength;
}

/**
 * Valida se é um email válido.
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return isValidString(email, 5, 255) && emailRegex.test(email);
}

/**
 * Valida se é um inteiro positivo.
 */
function isValidPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

/**
 * Valida CNPJ (formato básico).
 */
function isValidCNPJ(cnpj) {
  if (!cnpj) return true; // Campo opcional
  const cleaned = cnpj.replace(/\D/g, '');
  return cleaned.length === 14 && /^\d+$/.test(cleaned);
}

/**
 * Valida um ano (entre 1900 e próximos 50 anos).
 */
function isValidYear(year) {
  const currentYear = new Date().getFullYear();
  return Number.isInteger(year) && year >= 1900 && year <= currentYear + 50;
}

/**
 * Sanitiza uma string removendo espaços extras.
 */
function sanitizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Valida credentials (username e password).
 */
function isValidCredentials(username, password) {
  return isValidString(username, 3, 50) && isValidString(password, 6, 128);
}

/**
 * Valida dados da escola.
 */
function isValidSchoolData(data) {
  if (!isValidString(data.name, 1, 255)) return false;
  if (data.acronym && !isValidString(data.acronym, 1, 10)) return false;
  if (data.cnpj && !isValidCNPJ(data.cnpj)) return false;
  return true;
}

/**
 * Valida dados do professor.
 */
function isValidTeacherData(data) {
  if (!isValidString(data.name, 1, 255)) return false;
  if (data.email && !isValidEmail(data.email)) return false;
  if (data.registration && !isValidString(data.registration, 1, 50)) return false;
  return true;
}

module.exports = {
  isValidString,
  isValidEmail,
  isValidPositiveInt,
  isValidCNPJ,
  isValidYear,
  sanitizeString,
  isValidCredentials,
  isValidSchoolData,
  isValidTeacherData,
};
