# Módulo de Assinatura — AULA

> **Status:** Pendente de implementação (ver `RESUMO_IMPLEMENTACAO.md`)
>
> Este módulo exibirá o plano atual da escola, opção de upgrade e faturas.
> A validação de plano real ocorre no backend (`motor/src/services/licenseService.js`).

---

## Planos Disponíveis

| ID             | Nome         | Preço/ano | 1º ano (-40%) | Turmas | Profs | Plano de Aula |
|----------------|--------------|-----------|---------------|--------|-------|---------------|
| `free`         | FREE         | R$ 0      | —             | —      | —     | ✗             |
| `starter`      | STARTER      | R$ 315    | R$ 189        | 5      | 22    | ✗             |
| `multi`        | MULTI        | R$ 540    | R$ 324        | 15     | 60    | ✗             |
| `maxxi`        | MAXXI        | R$ 980    | R$ 588        | 35     | 90    | ✗             |
| `plus`         | PLUS         | R$ 1.260  | R$ 756        | ∞      | ∞     | ✗             |
| `plus_premium` | PLUS PREMIUM | R$ 4.390  | R$ 2.634      | ∞      | ∞     | ✅ incluso    |
| `pro`          | PRO          | R$ 1.050  | R$ 630        | ∞      | ∞     | ✗ (PRO)       |
| `pro_premium`  | PRO PREMIUM  | R$ 4.110  | R$ 2.466      | ∞      | ∞     | ✅ incluso    |

Trial: 14 dias em todos os planos pagos.
Parcelamento: 5× sem acréscimo (escola) ou 5× +10% (individual).

---

## ADDON PLANO

Incluso em PLUS PREMIUM e PRO PREMIUM. Separado:

| Nome      | Público                         | Preço/ano |
|-----------|---------------------------------|-----------|
| PLANNER   | Escola até 22 profs             | R$ 2.210  |
| TEAM      | Escola até 60 profs             | R$ 3.960  |
| BASE      | Professor individual (na plataforma) | R$ 180 |
| SUPERPROF | Professor individual (fora)     | R$ 360    |

---

## Integração

O status de licença é recebido no JWT após login e consumido pelo `LicenseManager`:

```javascript
// Após login bem-sucedido:
window.LicenseManager.load(sessionData);

// Verificar acesso a um módulo:
window.LicenseManager.isLicensed('plano'); // true/false
window.LicenseManager.plan;               // 'plus_premium', etc.
window.LicenseManager.hasLessonPlans;     // true/false
```

Ver `src/renderer/data/license-client.js` para detalhes.
