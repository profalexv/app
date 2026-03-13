/**
 * src/db/database-web.js
 *
 * Módulo de banco de dados — usa Supabase JS SDK (mesmo que o motor).
 * Expõe uma interface Knex-compatível para minimizar mudanças no rest do código.
 *
 * Dev:   SUPABASE_URL + SUPABASE_SERVICE_KEY do motor/.env
 * Prod:  mesmas variáveis nas secrets do Fly.io
 *
 * A tabela 'schools' é renomeada para 'app_schools' automaticamente para
 * evitar conflito com a tabela 'schools' do motor (UUID x SERIAL).
 *
 * Exporta:
 *   setupDatabase()          — inicializa cliente Supabase, verifica conexão
 *   getDb()                  — retorna função-fábrica Knex-compatível
 *   hashPassword(pw)         — retorna hash bcrypt (Promise)
 *   verifyPassword(pw, hash) — valida hash bcrypt (Promise)
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

let _supabase = null;

// Tabelas que conflitam com o motor — renomeadas automaticamente
const TABLE_MAP = { schools: 'app_schools' };

// ─── Query builder Knex-compatível ───────────────────────────────────────────
class TableQuery {
  constructor(supabase, tableName) {
    this._sb      = supabase;
    this._table   = TABLE_MAP[tableName] || tableName;
    this._op      = 'select';
    this._cols    = '*';
    this._eqs     = [];   // { col, val }
    this._neqs    = [];   // { col, val }
    this._lts     = [];   // { col, val }
    this._gtes    = [];   // { col, val }
    this._ins     = [];   // { col, vals }
    this._data    = null;
    this._ret     = null; // returning cols
    this._first   = false;
    this._orders  = [];   // { col, asc }
    this._limitN  = null;
    this._isCount = false;
    this._cntAlias = 'cnt';
  }

  select(...args) {
    if (args.length === 0) { this._cols = '*'; return this; }
    const flat = args.flat();
    this._cols = flat.length === 1 ? flat[0] : flat.join(', ');
    return this;
  }

  where(condOrCol, val) {
    if (condOrCol && typeof condOrCol === 'object') {
      for (const [k, v] of Object.entries(condOrCol)) this._eqs.push({ col: k, val: v });
    } else if (typeof condOrCol === 'string') {
      this._eqs.push({ col: condOrCol, val });
    }
    return this;
  }

  whereNot(condOrCol, val) {
    if (condOrCol && typeof condOrCol === 'object') {
      for (const [k, v] of Object.entries(condOrCol)) this._neqs.push({ col: k, val: v });
    } else if (typeof condOrCol === 'string') {
      this._neqs.push({ col: condOrCol, val });
    }
    return this;
  }

  whereIn(col, vals) { this._ins.push({ col, vals }); return this; }

  // Converte padrões de expiração de sessão conhecidos para lt/gte
  whereRaw(sql) {
    const hours = parseInt(sql.match(/(\d+)\s*hours?/i)?.[1] || 8);
    const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    if (/</.test(sql)) this._lts.push({ col: 'created_at', val: cutoff });
    else               this._gtes.push({ col: 'created_at', val: cutoff });
    return this;
  }

  insert(data) { this._op = 'insert'; this._data = data; return this; }
  update(data) { this._op = 'update'; this._data = data; return this; }
  del()        { this._op = 'delete'; return this; }
  delete()     { return this.del(); }

  returning(cols) {
    this._ret = Array.isArray(cols) ? cols.join(', ') : cols;
    return this;
  }

  orderBy(colOrArr, dir = 'asc') {
    if (Array.isArray(colOrArr)) {
      colOrArr.forEach(o => {
        if (typeof o === 'string') this._orders.push({ col: o, asc: true });
        else this._orders.push({ col: o.column || o.col || o, asc: (o.order || o.dir || 'asc') === 'asc' });
      });
    } else {
      this._orders.push({ col: colOrArr, asc: dir === 'asc' });
    }
    return this;
  }

  first()    { this._first = true;  return this; }
  limit(n)   { this._limitN = n;    return this; }

  count(alias = 'id as cnt') {
    this._isCount = true;
    this._cntAlias = (alias.split(' as ')[1] || alias).trim();
    return this;
  }

  then(resolve, reject) { return this._exec().then(resolve, reject); }
  catch(fn)             { return this._exec().catch(fn); }

  _applyFilters(q) {
    for (const f of this._eqs)  q = q.eq(f.col, f.val);
    for (const f of this._neqs) q = q.neq(f.col, f.val);
    for (const f of this._lts)  q = q.lt(f.col, f.val);
    for (const f of this._gtes) q = q.gte(f.col, f.val);
    for (const f of this._ins)  q = q.in(f.col, f.vals);
    return q;
  }

  async _exec() {
    if (!_supabase) throw new Error('Banco não inicializado. Chame setupDatabase() primeiro.');

    // ── COUNT ──────────────────────────────────────────────────────────────
    if (this._isCount) {
      let q = this._sb.from(this._table).select('*', { count: 'exact', head: true });
      q = this._applyFilters(q);
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return [{ [this._cntAlias]: count ?? 0 }];
    }

    // ── SELECT ─────────────────────────────────────────────────────────────
    if (this._op === 'select') {
      let q = this._sb.from(this._table).select(this._cols);
      q = this._applyFilters(q);
      for (const o of this._orders) q = q.order(o.col, { ascending: o.asc });
      if (this._limitN) q = q.limit(this._limitN);
      const { data, error } = await q.limit(this._first ? 1 : (this._limitN || 10000));
      if (error) throw new Error(error.message);
      if (this._first) return Array.isArray(data) ? (data[0] ?? undefined) : undefined;
      return data ?? [];
    }

    // ── INSERT ─────────────────────────────────────────────────────────────
    if (this._op === 'insert') {
      let q = this._sb.from(this._table).insert(this._data);
      if (this._ret) q = q.select(this._ret);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      if (this._ret) return Array.isArray(data) ? data : (data ? [data] : []);
      return data;
    }

    // ── UPDATE ─────────────────────────────────────────────────────────────
    if (this._op === 'update') {
      let q = this._sb.from(this._table).update(this._data);
      q = this._applyFilters(q);
      if (this._ret) q = q.select(this._ret);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data;
    }

    // ── DELETE ─────────────────────────────────────────────────────────────
    if (this._op === 'delete') {
      let q = this._sb.from(this._table).delete();
      q = this._applyFilters(q);
      const { error } = await q;
      if (error) throw new Error(error.message);
    }
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────
/**
 * Retorna uma função-fábrica Knex-compatível: getDb()('tabela').where({...})
 * Também expõe:
 *   getDb().rpc(fn, args)              — chamada a stored procedure Supabase
 *   getDb().upsert(table, data, opts)  — upsert nativo Supabase
 */
function getDb() {
  const factory = (tableName) => new TableQuery(_supabase, tableName);
  factory.rpc         = (fn, args)          => _supabase?.rpc(fn, args);
  factory.upsert      = (table, data, opts) => _supabase?.from(TABLE_MAP[table] || table).upsert(data, opts);
  // raw() legado — lança erro descritivo
  factory.raw         = (_sql) => { throw new Error('getDb().raw() não suportado no modo Supabase. Refatore para rpc() ou upsert().'); };
  // transaction — Supabase JS não suporta transações client-side; executa o callback sequencialmente
  factory.transaction = async (fn) => fn(factory);
  return factory;
}

async function setupDatabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL e SUPABASE_SERVICE_KEY não configurados.\n' +
      'Copie do motor/.env (dev) ou configure as secrets do servidor (prod).'
    );
  }

  _supabase = createClient(url, key, { auth: { persistSession: false } });

  // Verifica conexão testando a tabela principal da app
  const { error } = await _supabase.from('app_schools').select('id').limit(1);
  if (error) {
    const msg = error.message || '';
    if (msg.includes('does not exist') || error.code === '42P01') {
      throw new Error(
        'Tabelas da app não encontradas no Supabase.\n' +
        'Execute o arquivo supabase/schema.sql no painel Supabase → SQL Editor.'
      );
    }
    throw new Error('Falha ao conectar ao Supabase: ' + msg);
  }
}

// ─── Senhas ───────────────────────────────────────────────────────────────────
const SALT_ROUNDS = 10;

async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

async function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

module.exports = { setupDatabase, getDb, hashPassword, verifyPassword };
