-- ============================================================
-- Migração: Tabelas e colunas faltantes
-- Data: 2026-03-12
-- ============================================================

-- 1. Coluna lesson_type em time_slots
ALTER TABLE time_slots ADD COLUMN IF NOT EXISTS lesson_type TEXT DEFAULT 'presencial';

-- 2. Colunas weekly_lessons e modalities em class_curricula
ALTER TABLE class_curricula ADD COLUMN IF NOT EXISTS weekly_lessons INTEGER DEFAULT 0;
ALTER TABLE class_curricula ADD COLUMN IF NOT EXISTS modalities JSONB DEFAULT '[]';

-- 3. Coluna work_mode em teachers
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS work_mode TEXT DEFAULT 'presencial';

-- 4. Tabela tutor_roles (papéis de tutor)
CREATE TABLE IF NOT EXISTS tutor_roles (
  id      SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES app_schools(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  color   TEXT NOT NULL DEFAULT '#6366f1',
  active  INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Tabela lesson_types (tipos de aula)
CREATE TABLE IF NOT EXISTS lesson_types (
  id      SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES app_schools(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  is_synchronous INTEGER NOT NULL DEFAULT 1,
  color   TEXT NOT NULL DEFAULT '#6b7280',
  active  INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Tabela class_tutors (tutores de turma)
CREATE TABLE IF NOT EXISTS class_tutors (
  id      SERIAL PRIMARY KEY,
  class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id  INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  tutor_role_id INTEGER REFERENCES tutor_roles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
