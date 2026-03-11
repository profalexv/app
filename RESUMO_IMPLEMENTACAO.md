# RESUMO DE IMPLEMENTAÇÃO — Aula

> Visão geral do que está implementado, em andamento e pendente.
> Última atualização: março/2026

---

## Stack

| Camada       | Tecnologia                                      |
|--------------|-------------------------------------------------|
| Frontend     | Browser SPA (HTML/CSS/JS vanilla + Web Worker)  |
| Backend      | Node.js (Fly.io, São Paulo)                     |
| Banco        | Supabase PostgreSQL (hosted / RLS por escola)   |
| Auth         | JWT 30 dias                                     |
| Pagamentos   | Mercado Pago (cobranças anuais)                 |
| PRO tunnel   | Cloudflare Tunnel (PostgreSQL na infra do cliente) |

---

## Planos implementados

### Hospedados

| Plano         | Preço/ano | 1º ano   | Turmas | Profs | Planos de Aula |
|---------------|-----------|----------|--------|-------|----------------|
| FREE          | R$ 0      | —        | —      | —     | ✗              |
| STARTER       | R$ 315    | R$ 189   | 5      | 22    | ✗              |
| MULTI         | R$ 540    | R$ 324   | 15     | 60    | ✗              |
| MAXXI         | R$ 980    | R$ 588   | 35     | 90    | ✗              |
| PLUS          | R$ 1.260  | R$ 756   | ∞      | ∞     | ✗              |
| PLUS PREMIUM  | R$ 4.390  | R$ 2.634 | ∞      | ∞     | ✅ incluso     |

### Auto-hospedados (LGPD)

| Plano        | Preço/ano | 1º ano   | Cloudflare Tunnel | Planos de Aula |
|--------------|-----------|----------|-------------------|----------------|
| PRO          | R$ 1.050  | R$ 630   | ✅                | ✗              |
| PRO PREMIUM  | R$ 4.110  | R$ 2.466 | ✅                | ✅ incluso     |

### ADDON PLANO (plataforma pedagógica separada)

| Nome      | Público                                        | Preço/ano |
|-----------|------------------------------------------------|-----------|
| PLANNER   | Escola no aula.app, até 22 professores         | R$ 2.210  |
| TEAM      | Escola no aula.app, até 60 professores         | R$ 3.960  |
| BASE      | Professor individual (escola já usa aula.app)  | R$ 180    |
| SUPERPROF | Professor individual (escola fora do aula.app) | R$ 360    |

- 1º ano: -40% em todos
- Parcelamento escola: 5× sem acréscimo, 6–10× +10%
- Parcelamento individual: 5× +10%

---

## Módulos do SPA

### ✅ Implementados

- **Auth** — login, primeiro admin, JWT, logout
- **Cronograma** — criação manual e sugestão automática (Web Worker), snapshots, confirmação
- **Registro de Aulas** — lançamento por turma/professor
- **Usuários/Pessoas** — modelo unificado (professor + colaborador + admin), disponibilidade semanal
- **Turmas** — criação, grade curricular, tutores
- **Componentes Curriculares** — por escola, atribuição por turma+professor
- **Turnos e Horários** — configuração de slots por turno
- **Tipos de Aula** — configuráveis por escola
- **Exportação/Impressão** — PDF por turma ou professor

### 🔧 Parcialmente implementado

- **Planos de Aula (ADDON)** — estrutura de dados pronta; editor BNCC e biblioteca em desenvolvimento
- **LicenseClient** — reflete plano do JWT; controle de abas por plano ativo

### 📋 Pendente

- **SupabaseProvider** — `data-provider.js` tem a interface; implementação em `supabase-provider.js`
- **Gerenciamento de assinatura** — tela de upgrade, cancelamento, faturas
- **Notificações push** (opcional)
- **App mobile** — PWA ou wrapper nativo (fase futura)

---

## Algoritmo de Geração de Cronograma

- Executa inteiramente no **Web Worker do navegador** (zero carga no servidor)
- Recebe: turmas, professores, disponibilidades, componentes, slots
- Retorna: grade otimizada (sem conflitos de professor/turma/sala)
- Lógica: backtracking com heurísticas (menor domínio primeiro)
- Snapshots salvos no Supabase; confirmação requer justificativa

---

## Infraestrutura

### Planos hospedados
```
Fly.io (Node.js) ──► Supabase PostgreSQL
  RLS: isolamento por school_id
  Backup: automático (Supabase)
```

### Planos PRO / PRO PREMIUM
```
Escola instala:  Cloudflare Tunnel + Docker (PostgreSQL)
Browser ──►      Cloudflare Tunnel ──► PostgreSQL da escola
```

---

## Segurança

- Senhas: bcrypt (no motor, nunca expostas ao browser)
- JWT: assinado com `JWT_SECRET`, expiração 30d
- RLS: Supabase Row Level Security — cada escola só acessa seus próprios dados
- HTTPS: obrigatório (Fly.io + Cloudflare)
- Sem dados na URL; tokens só em headers `Authorization: Bearer`
- Planos PRO: dados nunca saem da infra do cliente

---

## Arquivos-chave

| Arquivo                                         | Responsabilidade                         |
|-------------------------------------------------|------------------------------------------|
| `motor/src/services/licenseService.js`          | PLAN_LIMITS, validação de plano/trial    |
| `motor/src/services/authService.js`             | JWT, login, registro                     |
| `motor/supabase/migration.sql`                  | Schema + seed de planos                  |
| `system/src/renderer/data/data-provider.js`     | Interface DataProvider (stub Supabase)   |
| `system/src/renderer/data/license-client.js`    | Estado de licença frontend               |
| `system/src/renderer/app.js`                    | Boot SPA, navegação, ServerDetector      |
| `system/ARQUITETURA_MOTOR.md`                   | Fonte de verdade completa                |
