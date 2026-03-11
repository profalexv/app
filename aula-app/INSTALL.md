# AULA.app - Guia de Instalação

## 📱 Para Professores

### Android (Chrome)

1. **Abra o app no navegador**
   - Acesse o endereço fornecido pela escola
   - Exemplo: `https://aula.minhaescola.com.br/app`

2. **Instale o app**
   - Toque no menu (⋮) no canto superior direito
   - Selecione "Adicionar à tela inicial"
   - Confirme tocando em "Adicionar"

3. **Use o app**
   - O ícone aparecerá na tela inicial
   - Funciona como um app nativo
   - Pode ser usado offline após primeiro acesso

### iOS (Safari)

1. **Abra o app no Safari**
   - Acesse o endereço fornecido pela escola

2. **Instale o app**
   - Toque no botão Compartilhar (□↑) na barra inferior
   - Role para baixo e toque em "Adicionar à Tela de Início"
   - Edite o nome se desejar e toque em "Adicionar"

3. **Use o app**
   - O ícone aparecerá entre seus apps
   - Abre em tela cheia sem navegador

## 💻 Para Administradores

O AULA.app é servido pelo motor (Fly.io). Não é necessário configurar servidor separado.
O endereço do app para os professores é:
```
https://<dominio-da-escola>/app
```

### Deploy em Produção

#### Opção 1: Via Fly.io (recomendado)

O AULA.app é parte do motor. Execute `fly deploy` no repositório `Scholar/motor`.
O app estará disponível automaticamente em `https://<app>.fly.dev/app`.

#### Opção 2: Docker (auto-hospedado — planos PRO)

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t aula .
docker run -d -p 3000:3000 --env-file .env --restart always aula
```

### Configuração de Ícones Personalizados

1. **Crie os ícones**
   - Use uma ferramenta como [RealFaviconGenerator](https://realfavicongenerator.net/)
   - Design sugerido: Logo da escola ou símbolo de livro
   - Tamanhos necessários: 72, 96, 128, 144, 152, 192, 384, 512px

2. **Adicione os arquivos**
   ```bash
   cp icon-*.png aula-app/icons/
   ```

3. **Os tamanhos esperados são:**
   ```
   aula-app/icons/
   ├── icon-72.png
   ├── icon-96.png
   ├── icon-128.png
   ├── icon-144.png
   ├── icon-152.png
   ├── icon-192.png
   ├── icon-384.png
   └── icon-512.png
   ```

### Monitoramento

**Logs do serviço**
```bash
# Linux (systemd)
sudo journalctl -u aula -f

# Docker
docker-compose logs -f
```

**Verificar status**
```bash
# Teste de conectividade com o motor
curl https://<dominio-da-escola>/api/health

# App mobile
curl https://<dominio-da-escola>/app/
```

### Backup

O banco de dados é gerenciado pelo Supabase. Backups automáticos são configurados
no painel Supabase (`project > Database > Backups`).
Para planos PRO (auto-hospedados), o backup do PostgreSQL é responsabilidade do
operador da escola.

## 🔐 Segurança

### Recomendações

1. **Use HTTPS em produção** (obrigatório para PWA funcionar corretamente)
2. **Configure firewall** (libere apenas porta 80/443)
3. **Backup regular** do banco de dados
4. **Atualizações** regulares do sistema
5. **Senhas fortes** para administradores

### Checklist de Produção

- [ ] HTTPS configurado (SSL/TLS)
- [ ] Firewall configurado
- [ ] Backup automático configurado
- [ ] Logs sendo monitorados
- [ ] Domínio próprio configurado
- [ ] Ícones personalizados adicionados
- [ ] Senhas padrão alteradas
- [ ] Teste de instalação PWA realizado

## 🆘 Troubleshooting

### App não instala no celular

- Verifique se está usando HTTPS (obrigatório)
- Limpe cache do navegador
- Verifique se o `manifest.json` está acessível
- Tente em modo privado/anônimo primeiro

### Não funciona offline

- Primeiro acesso deve ser online
- Service Worker precisa ser registrado
- Verifique console do navegador (F12)

### Erros de autenticação

- Verifique servidor backend está rodando
- Confirme URL do servidor no login
- Verifique logs do servidor

## 📞 Suporte

Para suporte técnico:
- Documentação: [README.md](../README.md)
- Issues: [GitHub Issues](sua-url)
- Email: suporte@suaescola.com.br
