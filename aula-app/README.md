# AULA.app - App do Professor

Aplicativo mobile (PWA) para professores da plataforma AULA.

## 🚀 Funcionalidades

- ✅ **Visualizar horários pessoais** - Veja sua grade de horários semanal
- ✅ **Consultar horários de turmas** - Acesse o horário de qualquer turma da escola
- ✅ **Agendar recursos** - Reserve salas, laboratórios e outros recursos  
- ✅ **Modo offline** - Funciona sem conexão após primeiro acesso
- ✅ **Instalável** - Pode ser instalado como app no celular

## 📱 Como Usar

### No Navegador
1. Acesse `https://seu-servidor.com/app/` pelo navegador móvel
2. Faça login com suas credenciais de professor
3. Pronto! Você pode usar o app no navegador

### Instalar como App
1. Acesse pelo navegador móvel (Chrome/Safari)
2. **Android**: Toque no menu (⋮) → "Adicionar à tela inicial"
3. **iOS**: Toque em Compartilhar (□↑) → "Adicionar à Tela de Início"
4. O ícone do AULA aparecerá na sua tela inicial

## 🏗️ Tecnologias

- **Progressive Web App (PWA)** - Padrão web moderno
- **Service Workers** - Funcionamento offline
- **Manifest.json** - Instalação como app nativo
- **Vanilla JavaScript** - Sem dependências externas
- **Responsive Design** - Adaptado para celulares e tablets

## 🔐 Segurança

- Tokens de autenticação armazenados localmente
- Comunicação via HTTPS (produção)
- Sessões com expiração automática

## 📂 Estrutura

```
aula-app/
├── index.html          # Interface principal
├── app.js              # Lógica da aplicação
├── styles.css          # Estilos responsivos
├── manifest.json       # Configuração PWA
├── service-worker.js   # Cache e offline
├── offline.html        # Página offline
├── icons/              # Ícones do app (vários tamanhos)
└── README.md           # Esta documentação
```

## 🛠️ Desenvolvimento

### Requisitos
- Servidor AULA rodando (backend)
- Navegador com suporte a PWA

### Testar Localmente
1. Configure o servidor backend
2. Acesse `http://localhost:3000/app/`
3. Use DevTools para simular dispositivo móvel

## 📝 TODO

- [ ] Push notifications para mudanças de horário
- [ ] Modo escuro
- [ ] Sincronização em background
- [ ] Chat com coordenação (futuro)
- [ ] Mapa de navegação da escola (futuro)

## 📄 Licença

MIT - Parte do projeto AULA
