# ÍNDICE RÁPIDO — Aula (Sistema de Gestão Escolar Web)

> Referência rápida para desenvolvimento. Fonte de verdade: `ARQUITETURA_MOTOR.md`.

---

## 1. Arquitetura

```
Browser (SPA)
  └── Web Worker  ←── algoritmo de geração de cronograma
  └── Fetch API   ──► Fly.io (Node.js — São Paulo)
                          └── Supabase PostgreSQL (multi-tenant, RLS)

Planos PRO / PRO PREMIUM:
  Browser ──► Cloudflare Tunnel ──► servidor da escola ──► PostgreSQL próprio
```

- **Sem Electron, sem SQLite, sem instalação local**
- Geração de grade: Web Worker no navegador (zero carga CPU no Fly.io)
- Auth: JWT 30 dias, rotação automática
- Pagamentos: Mercado Pago (anuais)

---

## 2. Planos e Preços

### Hospedados (nós gerenciamos)

| ID             | Nome          | Preço/ano | 1º ano (-40%) | Turmas | Profs | Plano de Aula |
|----------------|---------------|-----------|---------------|--------|-------|---------------|
| `free`         | FREE          | R$ 0      | —             | —      | —     | ✗             |
| `starter`      | STARTER       | R$ 315    | R$ 189        | 5      | 22    | ✗             |
| `multi`        | MULTI         | R$ 540    | R$ 324        | 15     | 60    | ✗             |
| `maxxi`        | MAXXI         | R$ 980    | R$ 588        | 35     | 90    | ✗             |
| `plus`         | PLUS          | R$ 1.260  | R$ 756        | ∞      | ∞     | ✗             |
| `plus_premium` | PLUS PREMIUM  | R$ 4.390  | R$ 2.634      | ∞      | ∞     | ✅ incluso    |

### Auto-hospedados (dados na infra da escola — LGPD)

| ID            | Nome         | Preço/ano | 1º ano (-40%) | Cloudflare Tunnel | Plano de Aula |
|---------------|--------------|-----------|---------------|-------------------|---------------|
| `pro`         | PRO          | R$ 1.050  | R$ 630        | ✅                | ✗             |
| `pro_premium` | PRO PREMIUM  | R$ 4.110  | R$ 2.466      | ✅                | ✅ incluso    |

### ADDON PLANO (plataforma de planos de aula)

Incluso em PLUS PREMIUM e PRO PREMIUM. Disponível separadamente:

| Nome       | Público                                      | Preço/ano | 1º ano    |
|------------|----------------------------------------------|-----------|-----------|
| PLANNER    | Escola no aula.app até 22 profs              | R$ 2.210  | R$ 1.326  |
| TEAM       | Escola no aula.app até 60 profs              | R$ 3.960  | R$ 2.376  |
| BASE       | Professor individual (escola usa aula.app)   | R$ 180    | R$ 20/mês |
| SUPERPROF  | Professor individual (escola não usa aula.app)| R$ 360   | R$ 40/mês |

---

## 3. Descontos para Redes

| Escolas        | Desconto nas adicionais |
|----------------|------------------------|
| 2–5            | 15%                    |
| 6–15           | 30%                    |
| 16–40          | 45%                    |
| 41–64          | 55%                    |
| 65+            | Consultar              |

---

## 4. Parcelamento

- **Escolas:** até 5× sem acréscimo; 6–10× +10%
- **Individual (BASE/SUPERPROF):** até 5× +10%

---

## 5. Trial

- 14 dias gratuitos em todos os planos pagos
- Restrições durante trial: exportação PDF, salvar sugestão, histórico, exportação mobile, máx. 3 confirmações de cronograma

---

## 6. Estrutura de Arquivos Relevantes

```
system/
  aula/index.html              Landing page (SPA)
  src/
    renderer/
      app.js                   Boot do SPA, ServerDetector, navegação entre abas
      index.html               Shell da aplicação
      data/
        data-provider.js       Abstração de dados (stub SupabaseProvider)
        license-client.js      Controle de módulos por plano (via JWT)
      modules/
        auth/                  Tela de login/cadastro
        cronograma/            Módulo de cronograma
        aula/                  Módulo de registro de aulas
        usuarios/              Gestão de professores e pessoas
    utils/
      logger.js                Winston (logs em ~/.config/aula/logs/)
      validators.js            Validação de campos

motor/ (repositório separado — Fly.io Node.js)
  src/services/
    licenseService.js          PLAN_LIMITS, validação de plano
    authService.js             JWT, login, registro
  supabase/
    migration.sql              Schema PostgreSQL + seed de planos
```

---

## 7. Endpoints Principais (motor)

| Método | Rota                    | Descrição                        |
|--------|-------------------------|----------------------------------|
| POST   | /auth/login             | Login escola ou professor        |
| POST   | /auth/register          | Cadastro (trial 14d)             |
| GET    | /api/schools            | Listar escolas do usuário        |
| GET    | /api/schedule/:id       | Cronograma por escola            |
| POST   | /api/schedule/suggest   | Disparar sugestão (Web Worker)   |
| GET    | /api/license/status     | Status do plano/trial da escola  |
| POST   | /api/license/activate   | Ativar ADDON ou upgrade de plano |

---

## 8. Variáveis de Ambiente (motor)

```env
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
JWT_SECRET=
MP_ACCESS_TOKEN=          # Mercado Pago
PORT=3000
NODE_ENV=production
```

---

## 9. Deploy

- **Hospedados:** `fly deploy` (Fly.io São Paulo) + Supabase
- **PRO/PRO PREMIUM:** cliente instala Cloudflare Tunnel na infra própria; aponta para instância PostgreSQL local
- **CI:** push em `main` → deploy automático via GitHub Actions

---

## 10. Documentos de Referência

| Arquivo                        | Conteúdo                                  |
|--------------------------------|-------------------------------------------|
| `ARQUITETURA_MOTOR.md`         | Arquitetura completa, planos, decisões    |
| `SETUP_CLOUDFLARE_TUNNEL.md`   | Configuração do Tunnel para planos PRO    |
| `CONCLUSAO.md`                 | Status do projeto e próximos passos       |
