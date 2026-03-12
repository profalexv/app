-- ============================================================
-- Migração: Addon Registro de Ponto de Funcionário
-- Data: 2026-03-13
-- ============================================================

-- 1. Controle de assinatura do addon Ponto
CREATE TABLE IF NOT EXISTS ponto_addon_subscriptions (
  id          SERIAL PRIMARY KEY,
  school_id   INTEGER NOT NULL REFERENCES app_schools(id) ON DELETE CASCADE,
  plan_type   TEXT    NOT NULL DEFAULT 'per_employee',
              -- per_employee | mini | pronto | maximo
  max_employees INTEGER NOT NULL DEFAULT 0,   -- 0 = ilimitado (maximo/per_employee)
  status      TEXT    NOT NULL DEFAULT 'active', -- active | inactive
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id)
);

-- 2. Cadastro de funcionários
CREATE TABLE IF NOT EXISTS ponto_employees (
  id          SERIAL PRIMARY KEY,
  school_id   INTEGER NOT NULL REFERENCES app_schools(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  cpf         TEXT,
  email       TEXT,
  role        TEXT,
  department  TEXT,
  pin         TEXT,              -- PIN hashed (bcrypt) para bater ponto
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Registros de ponto
CREATE TABLE IF NOT EXISTS ponto_records (
  id          SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES ponto_employees(id) ON DELETE CASCADE,
  school_id   INTEGER NOT NULL REFERENCES app_schools(id)     ON DELETE CASCADE,
  type        TEXT    NOT NULL,  -- entrada | saida | pausa_inicio | pausa_fim
  punched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  latitude    NUMERIC(10,8),
  longitude   NUMERIC(11,8),
  source      TEXT    NOT NULL DEFAULT 'browser', -- browser | app
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ponto_records_employee ON ponto_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_ponto_records_school   ON ponto_records(school_id);
CREATE INDEX IF NOT EXISTS idx_ponto_records_date     ON ponto_records(punched_at);
