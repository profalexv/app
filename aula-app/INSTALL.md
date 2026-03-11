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

### Configuração do Servidor

1. **Instale as dependências**
   ```bash
   cd /caminho/para/sistema
   npm install
   ```

2. **Inicie o servidor**
   ```bash
   # Produção
   npm run web
   
   # Ou com porta customizada
   PORT=8080 npm run web
   ```

3. **O AULA.app estará disponível em**
   - Local: `http://localhost:3000/app`
   - Rede: `http://{IP-DO-SERVIDOR}:3000/app`

### Deploy em Produção

#### Opção 1: Servidor Próprio

1. **Instale Node.js 18+ no servidor**

2. **Clone/copie o projeto**
   ```bash
   git clone [seu-repositorio]
   cd system
   npm install --production
   ```

3. **Configure como serviço (systemd)**
   ```ini
   # /etc/systemd/system/aula.service
   [Unit]
   Description=AULA - Sistema Escolar
   After=network.target

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/var/www/aula
   ExecStart=/usr/bin/node server.js
   Restart=always
   Environment=NODE_ENV=production
   Environment=PORT=3000

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo systemctl enable aula
   sudo systemctl start aula
   ```

4. **Configure Nginx como proxy reverso**
   ```nginx
   # /etc/nginx/sites-available/aula
   server {
       listen 80;
       server_name aula.suaescola.com.br;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }

       # Cache para o app
       location /app/ {
           proxy_pass http://localhost:3000/app/;
           add_header Cache-Control "public, max-age=86400";
       }
   }
   ```

5. **Configure SSL (certbot)**
   ```bash
   sudo certbot --nginx -d aula.suaescola.com.br
   ```

#### Opção 2: Docker

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

```yaml
# docker-compose.yml
version: '3'
services:
  aula:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/root/.config/aula
    environment:
      - NODE_ENV=production
    restart: always
```

```bash
docker-compose up -d
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
# Teste de conectividade
curl http://localhost:3000/api/schools

# App mobile
curl http://localhost:3000/app/
```

### Backup

**Banco de dados**
```bash
# Localização padrão
~/.config/aula/aula.db

# Backup automático
cp ~/.config/aula/aula.db ~/backups/aula-$(date +%Y%m%d).db
```

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
