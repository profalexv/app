#!/bin/bash

# Deploy AULA para Produção
# Este script configura e faz deploy do AULA em um servidor Linux

set -e

echo "🚀 Deploy AULA - Sistema de Gestão Escolar"
echo "=========================================="
echo ""

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configurações
DOMAIN=${1:-"aula.localhost"}
INSTALL_DIR="/opt/aula"
SERVICE_USER="aula"
SERVICE_GROUP="aula"

# Verifica permissões
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ Este script deve ser executado como root${NC}"
  exit 1
fi

echo -e "${BLUE}📋 Checklist de Pré-requisitos${NC}"
echo "================================"

# Verifica dependências
check_command() {
  if command -v $1 &> /dev/null; then
    echo -e "${GREEN}✓ $1${NC}"
    return 0
  else
    echo -e "${RED}✗ $1 não encontrado${NC}"
    return 1
  fi
}

check_command "docker"
check_command "docker-compose"
check_command "curl"

echo ""
echo -e "${BLUE}🔧 Configurando AULA${NC}"
echo "===================="

# Cria diretório de instalação
mkdir -p $INSTALL_DIR
cd $INSTALL_DIR

# Clone do repositório (ou copiar arquivos)
if [ -d ".git" ]; then
  echo "Atualizando repositório..."
  git pull origin main
else
  echo "Crie o repositório em $INSTALL_DIR"
  echo "ou configure um clone Git"
  exit 1
fi

# Copia arquivo de ambiente
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo -e "${YELLOW}⚠️  Configure .env manualmente:${NC}"
  echo "  nano .env"
fi

# Cria diretórios de dados
mkdir -p data backups

# Define permissões
chown -R $SERVICE_USER:$SERVICE_GROUP $INSTALL_DIR
chmod -R 755 $INSTALL_DIR
chmod 700 data backups

echo ""
echo -e "${BLUE}🐳 Iniciando com Docker${NC}"
echo "======================="

# Build da imagem
echo "Construindo imagem Docker..."
docker-compose build --no-cache

# Inicia serviços
echo "Iniciando serviços..."
docker-compose up -d

# Aguarda container estar pronto
echo "Aguardando sistema inicializar..."
sleep 5

# Verifica saúde
if docker-compose exec -T aula curl -f http://localhost:3000/api/schools > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Sistema iniciado com sucesso${NC}"
else
  echo -e "${RED}✗ Falha ao inicializar sistema${NC}"
  echo "Logs:"
  docker-compose logs aula
  exit 1
fi

echo ""
echo -e "${BLUE}🌐 Configurando Nginx${NC}"
echo "=================="

# Gera certificado auto-assinado (para teste)
if [ ! -f "certs/cert.pem" ]; then
  mkdir -p certs
  openssl req -x509 -newkey rsa:4096 \
    -keyout certs/key.pem -out certs/cert.pem \
    -days 365 -nodes \
    -subj "/CN=$DOMAIN"
  echo -e "${GREEN}✓ Certificado auto-assinado criado${NC}"
fi

# Inicia nginx (opcional)
# docker-compose --profile with-nginx up -d nginx

echo ""
echo -e "${BLUE}📊 Backup Automático (planos PRO — auto-hospedado)${NC}"
echo "==================================================="

# Cria script de backup do banco local (SQLite — planos PRO)
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/aula/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_PATH="$HOME/.config/aula/aula.db"

mkdir -p $BACKUP_DIR

if [ -f "$DB_PATH" ]; then
  cp "$DB_PATH" "$BACKUP_DIR/aula-$TIMESTAMP.db"
  
  # Remove backups antigos (> 30 dias)
  find $BACKUP_DIR -name "aula-*.db" -mtime +30 -delete
  
  echo "✓ Backup criado: $TIMESTAMP"
fi
EOF

chmod +x backup.sh

# Agendamento de backup (cron)
(crontab -l 2>/dev/null | grep -v backup.sh; \
 echo "0 2 * * * cd /opt/aula && ./backup.sh") | crontab -

echo -e "${GREEN}✓ Backup automático agendado (02:00 diárias)${NC}"

echo ""
echo -e "${BLUE}📋 Informações do Servidor${NC}"
echo "========================="
echo ""
echo -e "Sistema: ${GREEN}http://localhost:3000${NC}"
echo "App Prof: ${GREEN}http://localhost:3000/app${NC}"
echo "Domínio:  ${YELLOW}$DOMAIN${NC}"
echo "Banco:    ${YELLOW}$INSTALL_DIR/data${NC}"
echo ""
echo -e "${YELLOW}⚠️  Próximos passos:${NC}"
echo "1. Configure .env se necessário"
echo "2. Configure DNS apontando para este servidor"
echo "3. Obtenha certificado SSL real (Let's Encrypt)"
echo "4. Atualize nginx.conf com domínio e certificado"
echo "5. Configure firewall (porta 80, 443)"
echo ""
echo -e "${GREEN}✓ Deploy concluído!${NC}"
