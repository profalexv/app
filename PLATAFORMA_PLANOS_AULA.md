# ADDON PLANO — Plataforma de Planos de Aula

> Módulo pedagógico do Aula. Incluso nos planos PLUS PREMIUM e PRO PREMIUM.
> Pode ser adquirido separadamente para qualquer plano hospedado ou PRO.

---

## Tiers do ADDON

### Pacotes para escola

| Nome    | Contexto                              | Preço/ano | 1º ano (-40%) |
|---------|---------------------------------------|-----------|---------------|
| PLANNER | Escola no aula.app, até 22 professores | R$ 2.210 | R$ 1.326      |
| TEAM    | Escola no aula.app, até 60 professores | R$ 3.960 | R$ 2.376      |

> Escolas com mais de 60 professores devem usar PLUS PREMIUM ou PRO PREMIUM (ADDON incluso).

### Assinaturas individuais de professor

| Nome      | Contexto                                           | Preço/ano | Mensal    |
|-----------|----------------------------------------------------|-----------|-----------|
| BASE      | Professor em escola que já usa aula.app (sem pacote)| R$ 180   | R$ 20/mês |
| SUPERPROF | Professor em escola que **não** usa aula.app       | R$ 360    | R$ 40/mês |

> Cobrança anual preferencial. Mensal disponível (sem desconto de 1º ano).

---

## Inclusão nos planos premium

| Plano         | ADDON PLANO incluso? |
|---------------|----------------------|
| FREE          | ✗                    |
| STARTER       | ✗ (pode adquirir separado) |
| MULTI         | ✗ (pode adquirir separado) |
| MAXXI         | ✗ (pode adquirir separado) |
| PLUS          | ✗ (pode adquirir separado) |
| **PLUS PREMIUM** | ✅ incluso        |
| PRO           | ✗ (pode adquirir separado) |
| **PRO PREMIUM**  | ✅ incluso        |

---

## Funcionalidades do ADDON PLANO

- Editor de planos de aula estruturado (BNCC)
- Campos: objetivos, metodologia, avaliação, recursos, referências
- Biblioteca compartilhada entre professores da escola
- Templates customizáveis por escola
- Histórico de versões por plano
- Sincronização com componentes curriculares cadastrados
- Exportação PDF

---

## Modelo de dados (Supabase)

```sql
-- Planos de aula
lesson_plans (
  id, school_id, teacher_id, curricula_id,
  title, objectives, methodology, assessment,
  resources, references, bncc_codes[],
  created_at, updated_at
)

-- addon_type no cadastro de escola:
--   'included'   → PLUS PREMIUM / PRO PREMIUM
--   'planner'    → ADDON PLANNER (escola, até 22 profs)
--   'team'       → ADDON TEAM (escola, até 60 profs)
--   'base'       → Individual BASE
--   'superprof'  → Individual SUPERPROF
--   NULL         → sem acesso
```

---

## Controle de acesso

A flag `lessonPlans: true` no `PLAN_LIMITS` de `licenseService.js` (motor) habilita o módulo.
O `LicenseManager` no browser reflete esse valor via JWT e bloqueia a aba se `false`.

```javascript
// motor/src/services/licenseService.js
const PLAN_LIMITS = {
  plus_premium: { lessonPlans: true,  ... },
  pro_premium:  { lessonPlans: true,  ... },
  // demais: lessonPlans: false (desbloqueado via ADDON ativo)
};
```

---

## Parcelamento

- Pacotes (PLANNER/TEAM): igual ao plano principal da escola — 5× sem acréscimo, 6–10× +10%
- Individual (BASE/SUPERPROF): até 5× com +10%
