# Aula — Sistema de Gestão Escolar Web

Plataforma web para gestão de instituições de ensino: cronograma automático, controle de turmas, professores e componentes curriculares — gerado diretamente no navegador, sem instalar nada.

## Componentes

### `system/` — Browser SPA (este repositório)
Interface principal para coordenadores e administradores escolares.

- Sugestão automática de cronograma (Web Worker no browser)
- Gestão de turmas, professores, turnos, componentes curriculares
- Registro de aulas e controle de disponibilidade
- Plataforma de planos de aula BNCC (ADDON PLANO)
- Multi-escola, multi-turno
- Acesso via navegador (sem instalação)

### `motor/` — API Backend (Fly.io + Supabase)
Node.js hospedado em Fly.io (São Paulo). Banco Supabase PostgreSQL com RLS.

- Autenticação JWT
- Validação de planos e licenças
- Integração Mercado Pago
- Planos PRO: roteamento para Cloudflare Tunnel da escola

## Planos

| Plano         | Preço/ano | 1º ano   | Destaque                            |
|---------------|-----------|----------|-------------------------------------|
| FREE          | R$ 0      | —        | Cronograma básico                   |
| STARTER       | R$ 315    | R$ 189   | Até 5 turmas / 22 profs             |
| MULTI         | R$ 540    | R$ 324   | Até 15 turmas / 60 profs            |
| MAXXI         | R$ 980    | R$ 588   | Até 35 turmas / 90 profs            |
| PLUS          | R$ 1.260  | R$ 756   | Ilimitado                           |
| PLUS PREMIUM  | R$ 4.390  | R$ 2.634 | Ilimitado + ADDON PLANO incluso     |
| PRO           | R$ 1.050  | R$ 630   | Auto-hospedado (LGPD)               |
| PRO PREMIUM   | R$ 4.110  | R$ 2.466 | Auto-hospedado + ADDON PLANO incluso|

Trial de 14 dias. 40% de desconto no 1º ano.

## Desenvolvimento

```bash
# Servir SPA localmente
npm start               # node server.js
npm run dev             # node server.js --dev
```

Acesse: `http://localhost:3000`

## Documentação

| Arquivo                        | Conteúdo                                    |
|--------------------------------|---------------------------------------------|
| `ARQUITETURA_MOTOR.md`         | Arquitetura completa (fonte de verdade)     |
| `INDICE_RAPIDO.md`             | Referência rápida de planos, endpoints, env |
| `RESUMO_IMPLEMENTACAO.md`      | Status de implementação por módulo          |
| `PLATAFORMA_PLANOS_AULA.md`    | ADDON PLANO — tiers e controle de acesso    |
| `SETUP_CLOUDFLARE_TUNNEL.md`   | Configuração do Tunnel para planos PRO      |
| `CONCLUSAO.md`                 | Status atual e próximos passos              |

## Arquitetura

```
Browser (SPA)
  └── Web Worker  ────── algoritmo de geração de cronograma
  └── Fetch API   ──►   Fly.io (Node.js, São Paulo)
                            └── Supabase PostgreSQL (RLS por escola)

Planos PRO / PRO PREMIUM:
  Browser  ──►  Cloudflare Tunnel  ──►  PostgreSQL da escola (LGPD)
```
