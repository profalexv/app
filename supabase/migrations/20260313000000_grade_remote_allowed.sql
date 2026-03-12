-- ============================================================
-- Migração: remote_allowed em class_curricula
-- Data: 2026-03-13
-- ============================================================

-- Indica se o profissional pode cumprir as horas não presenciais
-- deste componente em regime de trabalho remoto.
ALTER TABLE class_curricula ADD COLUMN IF NOT EXISTS remote_allowed BOOLEAN NOT NULL DEFAULT false;
