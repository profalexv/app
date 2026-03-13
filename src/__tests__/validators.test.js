'use strict';

const {
  isValidString,
  isValidEmail,
  isValidPositiveInt,
  isValidCNPJ,
  isValidYear,
  sanitizeString,
  isValidCredentials,
  isValidSchoolData,
  isValidTeacherData,
} = require('../utils/validators');

// ─── isValidString ────────────────────────────────────────────────────────────
describe('isValidString', () => {
  test('rejeita string vazia', () => expect(isValidString('')).toBe(false));
  test('rejeita string apenas com espaços', () => expect(isValidString('   ')).toBe(false));
  test('rejeita não-string', () => expect(isValidString(null)).toBe(false));
  test('rejeita número', () => expect(isValidString(123)).toBe(false));
  test('rejeita string acima de maxLength', () => expect(isValidString('x'.repeat(300))).toBe(false));
  test('rejeita string abaixo de minLength', () => expect(isValidString('ab', 3)).toBe(false));
  test('aceita string válida', () => expect(isValidString('Nome')).toBe(true));
  test('aceita string no limite de maxLength', () => expect(isValidString('x'.repeat(255))).toBe(true));
  test('aceita string exatamente no minLength', () => expect(isValidString('abc', 3)).toBe(true));
});

// ─── isValidEmail ─────────────────────────────────────────────────────────────
describe('isValidEmail', () => {
  test('rejeita string sem @', () => expect(isValidEmail('invalido')).toBe(false));
  test('rejeita sem domínio após @', () => expect(isValidEmail('user@')).toBe(false));
  test('rejeita com espaço', () => expect(isValidEmail('user @escola.br')).toBe(false));
  test('rejeita string vazia', () => expect(isValidEmail('')).toBe(false));
  test('aceita e-mail simples', () => expect(isValidEmail('a@b.c')).toBe(true));
  test('aceita e-mail com subdomínio', () => expect(isValidEmail('user@escola.edu.br')).toBe(true));
  test('aceita e-mail com ponto no usuário', () => expect(isValidEmail('nome.sobrenome@escola.br')).toBe(true));
});

// ─── isValidPositiveInt ───────────────────────────────────────────────────────
describe('isValidPositiveInt', () => {
  test('rejeita zero', () => expect(isValidPositiveInt(0)).toBe(false));
  test('rejeita negativo', () => expect(isValidPositiveInt(-1)).toBe(false));
  test('rejeita float', () => expect(isValidPositiveInt(1.5)).toBe(false));
  test('rejeita string', () => expect(isValidPositiveInt('1')).toBe(false));
  test('aceita 1', () => expect(isValidPositiveInt(1)).toBe(true));
  test('aceita inteiro grande', () => expect(isValidPositiveInt(9999)).toBe(true));
});

// ─── isValidCNPJ ─────────────────────────────────────────────────────────────
describe('isValidCNPJ', () => {
  test('aceita null (campo opcional)', () => expect(isValidCNPJ(null)).toBe(true));
  test('aceita undefined (campo opcional)', () => expect(isValidCNPJ(undefined)).toBe(true));
  test('aceita string vazia (campo opcional)', () => expect(isValidCNPJ('')).toBe(true));
  test('rejeita CNPJ com menos de 14 dígitos', () => expect(isValidCNPJ('123456789')).toBe(false));
  test('rejeita CNPJ com letras', () => expect(isValidCNPJ('1234567800019A')).toBe(false));
  test('aceita CNPJ com 14 dígitos numéricos', () => expect(isValidCNPJ('12345678000195')).toBe(true));
  test('aceita CNPJ formatado (remove não-dígitos)', () => expect(isValidCNPJ('12.345.678/0001-95')).toBe(true));
});

// ─── isValidYear ─────────────────────────────────────────────────────────────
describe('isValidYear', () => {
  test('rejeita ano muito antigo', () => expect(isValidYear(1800)).toBe(false));
  test('rejeita float', () => expect(isValidYear(2025.5)).toBe(false));
  test('rejeita string', () => expect(isValidYear('2025')).toBe(false));
  test('aceita ano corrente', () => expect(isValidYear(new Date().getFullYear())).toBe(true));
  test('aceita 1900', () => expect(isValidYear(1900)).toBe(true));
  test('aceita ano futuro dentro do limite', () => expect(isValidYear(new Date().getFullYear() + 1)).toBe(true));
});

// ─── sanitizeString ───────────────────────────────────────────────────────────
describe('sanitizeString', () => {
  test('remove espaços nas bordas', () => expect(sanitizeString('  Nome  ')).toBe('Nome'));
  test('retorna string vazia para null', () => expect(sanitizeString(null)).toBe(''));
  test('retorna string vazia para undefined', () => expect(sanitizeString(undefined)).toBe(''));
  test('não altera string sem espaços extras', () => expect(sanitizeString('Normal')).toBe('Normal'));
});

// ─── isValidCredentials ───────────────────────────────────────────────────────
describe('isValidCredentials', () => {
  test('rejeita username muito curto', () => expect(isValidCredentials('ab', 'senha123')).toBe(false));
  test('rejeita senha muito curta', () => expect(isValidCredentials('admin', '123')).toBe(false));
  test('rejeita ambos inválidos', () => expect(isValidCredentials('', '')).toBe(false));
  test('rejeita username muito longo', () => expect(isValidCredentials('a'.repeat(60), 'senha123')).toBe(false));
  test('rejeita senha muito longa', () => expect(isValidCredentials('admin', 'x'.repeat(200))).toBe(false));
  test('aceita credenciais válidas', () => expect(isValidCredentials('admin', 'senha123')).toBe(true));
  test('aceita senha longa dentro do limite', () => expect(isValidCredentials('admin', 'x'.repeat(128))).toBe(true));
});

// ─── isValidSchoolData ────────────────────────────────────────────────────────
describe('isValidSchoolData', () => {
  test('rejeita sem nome', () => expect(isValidSchoolData({ name: '' })).toBe(false));
  test('rejeita nome null', () => expect(isValidSchoolData({ name: null })).toBe(false));
  test('rejeita acrônimo muito longo', () => expect(isValidSchoolData({ name: 'Escola', acronym: 'TOOLONGACRONYM' })).toBe(false));
  test('rejeita CNPJ inválido', () => expect(isValidSchoolData({ name: 'Escola', cnpj: '123' })).toBe(false));
  test('aceita dados mínimos', () => expect(isValidSchoolData({ name: 'Escola Municipal' })).toBe(true));
  test('aceita dados completos', () => expect(isValidSchoolData({ name: 'Escola', acronym: 'EM', cnpj: '12345678000195' })).toBe(true));
});

// ─── isValidTeacherData ───────────────────────────────────────────────────────
describe('isValidTeacherData', () => {
  test('rejeita sem nome', () => expect(isValidTeacherData({ name: '' })).toBe(false));
  test('rejeita e-mail inválido', () => expect(isValidTeacherData({ name: 'João', email: 'invalido' })).toBe(false));
  test('aceita sem e-mail (campo opcional)', () => expect(isValidTeacherData({ name: 'João' })).toBe(true));
  test('aceita com e-mail válido', () => expect(isValidTeacherData({ name: 'João', email: 'joao@escola.br' })).toBe(true));
  test('aceita com matrícula', () => expect(isValidTeacherData({ name: 'João', registration: 'MAT001' })).toBe(true));
});
