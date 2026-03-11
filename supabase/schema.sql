-- ============================================================================
-- Scholar App — Schema Supabase
-- Execute este arquivo no painel Supabase → SQL Editor (uma única vez).
--
-- NOTA: As tabelas do motor (plans, schools, school_admins, subscriptions,
-- school_tunnels, payments) JÁ EXISTEM no mesmo banco — NÃO as recrie aqui.
-- A tabela "schools" do motor usa UUID; para evitar conflito, as tabelas
-- pedagógicas da app usam "app_schools" (SERIAL).
-- ============================================================================

-- ── Configuração da escola (dados pedagógicos/locais) ─────────────────────────
CREATE TABLE IF NOT EXISTS app_schools (
  id         SERIAL PRIMARY KEY,
  name       TEXT    NOT NULL,
  acronym    TEXT,
  address    TEXT,
  cnpj       TEXT,
  inep_code  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Superadmins (gestores da plataforma local) ────────────────────────────────
CREATE TABLE IF NOT EXISTS superadmins (
  id         SERIAL PRIMARY KEY,
  name       TEXT    NOT NULL,
  username   TEXT    NOT NULL UNIQUE,
  password   TEXT    NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS superadmin_sessions (
  id         SERIAL PRIMARY KEY,
  admin_id   INTEGER NOT NULL REFERENCES superadmins(id) ON DELETE CASCADE,
  token      TEXT    NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Admins da escola ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id             SERIAL PRIMARY KEY,
  school_id      INTEGER NOT NULL REFERENCES app_schools(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,
  username       TEXT    NOT NULL UNIQUE,
  email          TEXT,
  password       TEXT    NOT NULL DEFAULT '',
  google_id      TEXT,
  microsoft_id   TEXT,
  auth_provider  TEXT    NOT NULL DEFAULT 'local',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id         SERIAL PRIMARY KEY,
  school_id  INTEGER NOT NULL REFERENCES app_schools(id) ON DELETE CASCADE,
  admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token      TEXT    NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id         SERIAL PRIMARY KEY,
  admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token      TEXT    NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Professores ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teachers (
  id           SERIAL PRIMARY KEY,
  school_id    INTEGER NOT NULL REFERENCES app_schools(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  registration TEXT,
  email        TEXT,
  subjects     TEXT,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessões do app professor (PWA)
CREATE TABLE IF NOT EXISTS sessions (
  id         SERIAL PRIMARY KEY,
  person_id  INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  token      TEXT    NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teacher_availability (
  id         SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  weekday    INTEGER NOT NULL,
  period     INTEGER NOT NULL,
  UNIQUE(teacher_id, weekday, period)
);

CREATE TABLE IF NOT EXISTS teacher_days (
  id         SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  weekday    INTEGER NOT NULL,
  UNIQUE(teacher_id, weekday)
);

-- ── Turnos e horários ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
  id         SERIAL PRIMARY KEY,
  school_id  INTEGER NOT NULL REFERENCES app_schools(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_slots (
  id         SERIAL PRIMARY KEY,
  shift_id   INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  period     INTEGER NOT NULL,
  start_time TEXT    NOT NULL DEFAULT '',
  end_time   TEXT    NOT NULL DEFAULT '',
  UNIQUE(shift_id, period)
);

-- ── Turmas ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id         SERIAL PRIMARY KEY,
  school_id  INTEGER NOT NULL REFERENCES app_schools(id) ON DELETE CASCADE,
  shift_id   INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
  name       TEXT    NOT NULL,
  year       INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Componentes curriculares ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curricula (
  id          SERIAL PRIMARY KEY,
  school_id   INTEGER NOT NULL REFERENCES app_schools(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  code        TEXT,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_curricula (
  id           SERIAL PRIMARY KEY,
  class_id     INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  curricula_id INTEGER NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  UNIQUE(class_id, curricula_id)
);

CREATE TABLE IF NOT EXISTS class_teacher_curricula (
  id                 SERIAL PRIMARY KEY,
  class_id           INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  curricula_id       INTEGER NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  teacher_id         INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  class_curricula_id INTEGER REFERENCES class_curricula(id) ON DELETE SET NULL,
  UNIQUE(class_id, curricula_id, teacher_id)
);

-- ── Cronogramas e aulas ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedules (
  id         SERIAL PRIMARY KEY,
  school_id  INTEGER NOT NULL REFERENCES app_schools(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  year       INTEGER NOT NULL,
  semester   INTEGER NOT NULL DEFAULT 1,
  active     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lessons (
  id          SERIAL PRIMARY KEY,
  schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE,
  resource_id INTEGER REFERENCES teachers(id)  ON DELETE SET NULL,
  teacher_id  INTEGER REFERENCES teachers(id)  ON DELETE SET NULL,
  person_id   INTEGER REFERENCES teachers(id)  ON DELETE SET NULL,
  weekday     INTEGER NOT NULL,
  period      INTEGER NOT NULL,
  subject     TEXT,
  classroom   TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Planos de aula ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lesson_plans (
  id               SERIAL PRIMARY KEY,
  school_id        INTEGER NOT NULL REFERENCES app_schools(id) ON DELETE CASCADE,
  teacher_id       INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  subject          TEXT,
  title            TEXT    NOT NULL,
  objectives       TEXT,
  content          TEXT,
  methodology      TEXT,
  resources        TEXT,
  evaluation       TEXT,
  duration_minutes INTEGER,
  date             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Recursos (salas, laboratórios, etc.) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS resources (
  id          SERIAL PRIMARY KEY,
  school_id   INTEGER NOT NULL REFERENCES app_schools(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  type        TEXT,
  capacity    INTEGER,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Agendamentos de recursos ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id          SERIAL PRIMARY KEY,
  resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  teacher_id  INTEGER NOT NULL REFERENCES teachers(id)  ON DELETE CASCADE,
  class_id    INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  weekday     INTEGER,
  period      INTEGER,
  date        TEXT,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'confirmado',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Licenças de módulos ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS licenses (
  id           SERIAL PRIMARY KEY,
  module_id    TEXT    NOT NULL UNIQUE,
  license_key  TEXT    NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ
);

-- ── Assinaturas locais (plano da escola nesta instância) ─────────────────────
CREATE TABLE IF NOT EXISTS school_subscriptions (
  id               SERIAL PRIMARY KEY,
  school_id        INTEGER NOT NULL REFERENCES app_schools(id) ON DELETE CASCADE,
  plan_type        TEXT    NOT NULL DEFAULT 'free',
  status           TEXT    NOT NULL DEFAULT 'active',
  max_classes      INTEGER NOT NULL DEFAULT 0,
  max_teachers     INTEGER NOT NULL DEFAULT 0,
  max_schools      INTEGER NOT NULL DEFAULT 1,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at    TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  last_payment_at  TIMESTAMPTZ,
  annual_price     NUMERIC(10,2) NOT NULL DEFAULT 0,
  first_year_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  franchise_paid   BOOLEAN NOT NULL DEFAULT TRUE,
  features_json    TEXT,
  activated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_history (
  id              SERIAL PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES school_subscriptions(id) ON DELETE CASCADE,
  event_type      TEXT    NOT NULL,
  plan_type       TEXT    NOT NULL,
  amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Push notifications ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           SERIAL PRIMARY KEY,
  teacher_id   INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subscription TEXT    NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(teacher_id, subscription)
);

-- ============================================================================
-- Stored Procedures — queries complexas com JOINs
-- Chamadas via getDb().rpc('app_get_teacher_schedule', { p_teacher_id: N })
-- ============================================================================

-- Horário completo de um professor (para o app do professor)
CREATE OR REPLACE FUNCTION app_get_teacher_schedule(p_teacher_id integer)
RETURNS TABLE(
  id              integer,
  weekday         integer,
  period          integer,
  class_id        integer,
  class_name      text,
  curriculum_name text,
  room            text,
  notes           text
) LANGUAGE sql AS $$
  SELECT DISTINCT
    l.id, l.weekday, l.period,
    cc.class_id,
    c.name  AS class_name,
    curr.name AS curriculum_name,
    l.classroom AS room,
    l.notes
  FROM lessons l
  JOIN class_teacher_curricula ctc ON ctc.teacher_id         = l.teacher_id
  JOIN class_curricula         cc  ON ctc.class_curricula_id = cc.id
  JOIN classes                 c   ON cc.class_id            = c.id
  JOIN curricula               curr ON cc.curricula_id       = curr.id
  WHERE l.teacher_id = p_teacher_id
  ORDER BY l.weekday, l.period
$$;

-- Horário completo de uma turma
CREATE OR REPLACE FUNCTION app_get_class_schedule(p_class_id integer)
RETURNS TABLE(
  id              integer,
  weekday         integer,
  period          integer,
  class_name      text,
  curriculum_name text,
  teacher_name    text,
  room            text,
  notes           text
) LANGUAGE sql AS $$
  SELECT
    l.id, l.weekday, l.period,
    c.name    AS class_name,
    curr.name AS curriculum_name,
    t.name    AS teacher_name,
    l.classroom AS room,
    l.notes
  FROM lessons l
  JOIN class_teacher_curricula ctc ON ctc.teacher_id         = l.teacher_id
  JOIN class_curricula         cc  ON ctc.class_curricula_id = cc.id
  JOIN classes                 c   ON cc.class_id            = c.id
  JOIN curricula               curr ON cc.curricula_id       = curr.id
  LEFT JOIN teachers           t   ON t.id                   = l.teacher_id
  WHERE c.id = p_class_id
  ORDER BY l.weekday, l.period
$$;
