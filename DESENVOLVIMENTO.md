# Guia de Desenvolvimento — Scholar/app

> **Leia antes de qualquer alteração no projeto.**  
> Este arquivo existe para evitar interpretações divergentes, especialmente por agentes de IA que nem sempre têm acesso ao histórico completo da conversa.

---

## Estrutura dos Repositórios

```
GitHub/Scholar/
├── app/      ← este repositório (Browser SPA + server.js)
├── motor/    ← API Node.js/Express (backend)
└── aula/     ← landing page institucional (GitHub Pages)
```

O **motor** está na pasta irmã (`../motor`), **não dentro deste repositório**.
O **aula** (landing page) está na pasta irmã (`../aula`), **não dentro deste repositório**.

---

## Infraestrutura de Produção

| Componente | Localização | URL |
|------------|-------------|-----|
| **Frontend (app)** | Fly.io | `https://app.alexandre.pro.br` (CNAME) |
| **Motor (API)** | Fly.io — São Paulo | `https://aula-motor.fly.dev` |
| **Banco de dados** | Supabase PostgreSQL | `https://rgiaryfatyvsfgqjubmh.supabase.co` |
| **Webhooks MP** | via motor | `https://aula-motor.fly.dev/api/webhooks/mercadopago` |
| **Landing page** | GitHub Pages | `https://aula.alexandre.pro.br` (CNAME) |

---

## Como Desenvolver

### Frontend (este repositório)

```bash
cd app/
npm install       # primeira vez
npm run dev       # inicia servidor local na porta 3000
```

O `.env` já aponta para o motor em produção:

```
MOTOR_URL=https://aula-motor.fly.dev
```

**Não é necessário rodar o motor localmente.** Todo o tráfego de API vai direto para o Fly.io.

### Motor (API backend)

O motor está em `../motor` e é deployado separadamente no Fly.io.

```bash
cd ../motor/
# Deploy de mudanças:
fly deploy -a aula-motor
```

> ⚠️ **Não existe ambiente de teste local para o motor.**  
> Não tente rodar `npm run dev` no motor para testes — use o Fly.io diretamente.  
> Não há `Dockerfile`, `docker-compose.yml` nem scripts de setup local neste repositório — foram removidos intencionalmente.

---

## Schema do Banco de Dados

O schema PostgreSQL (Supabase) é gerenciado **exclusivamente** pelo motor:

```
../motor/supabase/migration.sql
../motor/supabase/migrations/
```

A pasta `supabase/` **não existe** neste repositório (app) — foi removida para evitar duplicação e confusão.

---

## Variáveis de Ambiente (app/.env)

| Variável | Descrição |
|----------|-----------|
| `MOTOR_URL` | URL do motor — **sempre `https://aula-motor.fly.dev`** |
| `SUPABASE_URL` | URL do Supabase (compartilhado com o motor) |
| `SUPABASE_SERVICE_KEY` | Chave de serviço do Supabase |
| `MERCADOPAGO_PUBLIC_KEY` | Chave pública do MP (frontend) |
| `GOOGLE_CLIENT_ID/SECRET` | OAuth Google |
| `SESSION_SECRET` | Segredo da sessão Express |

> O `.env` nunca deve ser commitado. Está no `.gitignore`.

---

## Secrets no Fly.io (motor)

As variáveis secretas do motor vivem no Fly.io, não em arquivos locais:

```bash
fly secrets list -a aula-motor
```

Variáveis configuradas: `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,  
`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`, `MERCADOPAGO_WEBHOOK_SECRET`.

---

## Fluxo de Pagamento (Mercado Pago)

```
SPA → POST /api/payments/create-preference (motor)
    → Redireciona para Checkout Pro do MP
    → MP chama webhook: POST https://aula-motor.fly.dev/api/webhooks/mercadopago
    → Motor valida HMAC e ativa assinatura no Supabase
```

O webhook **exige URL pública** — por isso não há testes locais de webhook.

---

## Rotas do Motor

| Rota | Arquivo |
|------|---------|
| `POST /api/auth/login` | `motor/src/routes/auth.js` |
| `POST /api/payments/create-preference` | `motor/src/routes/payments.js` |
| `GET /api/payments/status/:schoolId` | `motor/src/routes/payments.js` |
| `POST /api/webhooks/mercadopago` | `motor/src/routes/webhooks.js` |
| `GET /api/admin/*` | `motor/src/routes/admin.js` |
| `GET /health` | `motor/src/app.js` |
