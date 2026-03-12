-- ============================================================
-- Migração: Addon Registro de Ponto de Funcionário
-- Data: 2026-03-13
--
-- Conformidade legal:
--   CLT Art. 74 §2/§4 — registros inalteráveis; retenção mínima 5 anos
--   Portaria MTP 671/2021 — REP-A (sistema alternativo por software);
--                           geração de AFD; identificação do trabalhador
--   LGPD Lei 13.709/2018 — consentimento documentado para coleta de GPS
-- ============================================================

-- 1. Controle de assinatura do addon Ponto
CREATE TABLE IF NOT EXISTS ponto_addon_subscriptions (
  id           SERIAL PRIMARY KEY,
  school_id    INTEGER NOT NULL REFERENCES app_schools(id) ON DELETE CASCADE,
  plan_type    TEXT    NOT NULL DEFAULT 'per_employee',
               -- per_employee | mini | pronto | maximo
  max_employees INTEGER NOT NULL DEFAULT 0,   -- 0 = ilimitado (maximo/per_employee)
  status       TEXT    NOT NULL DEFAULT 'active', -- active | inactive
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id)
);

-- 2. Cadastro de funcionários
--    Nunca excluímos fisicamente (soft delete via deleted_at) para garantir
--    que o histórico de ponto continue referenciável por 5 anos (CLT Art. 11).
--    gps_consent / gps_consent_at: base legal LGPD Art. 7 para coleta de localização.
CREATE TABLE IF NOT EXISTS ponto_employees (
  id              SERIAL PRIMARY KEY,
  school_id       INTEGER NOT NULL REFERENCES app_schools(id) ON DELETE CASCADE,
  name            TEXT    NOT NULL,
  cpf             TEXT,
  email           TEXT,
  role            TEXT,
  department      TEXT,
  pin             TEXT,              -- PIN em bcrypt; obrigatório para bater ponto
  active          BOOLEAN NOT NULL DEFAULT true,
  -- LGPD: consentimento expresso para coleta de GPS
  gps_consent     BOOLEAN NOT NULL DEFAULT false,
  gps_consent_at  TIMESTAMPTZ,
  -- Soft-delete: mantém o registro e os batimentos vinculados
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Registros de ponto
--    Registros são IMUTÁVEIS conforme CLT/Portaria 671.
--    Não usar ON DELETE CASCADE: histórico deve sobreviver ao funcionário.
--    Em vez de excluir, usa-se o campo cancelled_* para invalidar um batimento
--    que ocorreu por erro técnico documentado (ex: duplicidade por falha de rede).
CREATE TABLE IF NOT EXISTS ponto_records (
  id               SERIAL PRIMARY KEY,
  employee_id      INTEGER NOT NULL REFERENCES ponto_employees(id) ON DELETE RESTRICT,
  school_id        INTEGER NOT NULL REFERENCES app_schools(id)     ON DELETE RESTRICT,
  type             TEXT    NOT NULL,  -- entrada | saida | pausa_inicio | pausa_fim
  punched_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  latitude         NUMERIC(10,8),
  longitude        NUMERIC(11,8),
  source           TEXT    NOT NULL DEFAULT 'browser', -- browser | app
  notes            TEXT,
  -- Campos de cancelamento (imutabilidade: nunca deletar, só cancelar com justificativa)
  cancelled        BOOLEAN NOT NULL DEFAULT false,
  cancelled_at     TIMESTAMPTZ,
  cancelled_by     TEXT,   -- nome/id do gestor que cancelou
  cancel_reason    TEXT,   -- motivo obrigatório ao cancelar
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ponto_records_employee  ON ponto_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_ponto_records_school    ON ponto_records(school_id);
CREATE INDEX IF NOT EXISTS idx_ponto_records_date      ON ponto_records(punched_at);
CREATE INDEX IF NOT EXISTS idx_ponto_records_cancelled ON ponto_records(cancelled) WHERE cancelled = false;
