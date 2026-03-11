const winston = require('winston');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Diretório para logs
const LOG_DIR = path.join(os.homedir(), '.config', 'aula', 'logs');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Configuração do logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'aula-app' },
  transports: [
    // Arquivo de erro
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Arquivo geral
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

// Adiciona console em desenvolvimento
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `${timestamp} [${level}] ${message} ${metaStr}`;
      })
    ),
  }));
}

module.exports = logger;
