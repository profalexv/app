FROM node:18-alpine

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependências (apenas produção)
RUN npm ci --only=production

# Copiar código
COPY . .

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/schools', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# User não-root
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

# Expor porta
EXPOSE 3000

# Iniciar servidor
CMD ["node", "server.js"]
