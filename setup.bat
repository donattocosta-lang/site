@echo off
REM =====================================================
REM SCRIPT DE SETUP - Criar estrutura completa
REM Salve como: setup.bat
REM =====================================================

echo ========================================
echo    Setup da Plataforma IPTV
echo ========================================
echo.

REM Verificar se estamos na pasta correta
if not exist docker-compose.yml (
    echo [ERRO] docker-compose.yml nao encontrado!
    echo Execute este script na pasta raiz do projeto.
    pause
    exit /b 1
)

REM Criar estrutura de pastas
echo [1/6] Criando estrutura de pastas...
if not exist backend mkdir backend
if not exist frontend mkdir frontend
if not exist nginx mkdir nginx
if not exist logs mkdir logs

REM =====================================================
REM Criar Dockerfile do Backend
REM =====================================================
echo [2/6] Criando Dockerfile do Backend...

(
echo FROM node:18-alpine AS base
echo.
echo # Instalar dependencias do sistema
echo RUN apk add --no-cache curl
echo.
echo WORKDIR /app
echo.
echo # Copiar arquivos de dependencias
echo COPY package*.json ./
echo.
echo # Instalar dependencias
echo RUN npm ci --only=production
echo.
echo # Copiar codigo fonte
echo COPY . .
echo.
echo # Criar diretorio de logs
echo RUN mkdir -p logs
echo.
echo # Expor porta
echo EXPOSE 3001
echo.
echo # Healthcheck
echo HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
echo   CMD curl -f http://localhost:3001/health ^|^| exit 1
echo.
echo # Usuario nao-root para seguranca
echo RUN addgroup -g 1001 -S nodejs ^&^& adduser -S nodejs -u 1001
echo USER nodejs
echo.
echo # Comando de inicializacao
echo CMD ["node", "server.js"]
) > backend\Dockerfile

echo    - backend\Dockerfile criado

REM =====================================================
REM Criar .dockerignore do Backend
REM =====================================================
(
echo node_modules
echo npm-debug.log
echo .env
echo .git
echo .DS_Store
echo *.log
) > backend\.dockerignore

echo    - backend\.dockerignore criado

REM =====================================================
REM Verificar se server.js existe
REM =====================================================
if not exist backend\server.js (
    echo.
    echo [AVISO] backend\server.js nao encontrado!
    echo Voce precisa adicionar o codigo do backend na pasta backend\
    echo.
)

if not exist backend\package.json (
    echo.
    echo [AVISO] backend\package.json nao encontrado!
    echo Criando package.json basico...
    
    (
    echo {
    echo   "name": "iptv-revenda-backend",
    echo   "version": "1.0.0",
    echo   "description": "Backend para plataforma de revenda IPTV",
    echo   "main": "server.js",
    echo   "scripts": {
    echo     "start": "node server.js",
    echo     "dev": "nodemon server.js"
    echo   },
    echo   "dependencies": {
    echo     "@supabase/supabase-js": "^2.39.0",
    echo     "express": "^4.18.2",
    echo     "cors": "^2.8.5",
    echo     "helmet": "^7.1.0",
    echo     "morgan": "^1.10.0",
    echo     "dotenv": "^16.3.1",
    echo     "mercadopago": "^2.0.0",
    echo     "nodemailer": "^6.9.7",
    echo     "axios": "^1.6.2"
    echo   }
    echo }
    ) > backend\package.json
    
    echo    - backend\package.json criado
)

REM =====================================================
REM Criar Dockerfile do Frontend
REM =====================================================
echo [3/6] Criando Dockerfile do Frontend...

(
echo # Estagio 1: Build
echo FROM node:18-alpine AS builder
echo.
echo WORKDIR /app
echo.
echo # Copiar arquivos de dependencias
echo COPY package*.json ./
echo.
echo # Instalar dependencias
echo RUN npm ci
echo.
echo # Copiar codigo fonte
echo COPY . .
echo.
echo # Build da aplicacao
echo RUN npm run build
echo.
echo # Estagio 2: Producao com Nginx
echo FROM nginx:alpine
echo.
echo # Copiar build para nginx
echo COPY --from=builder /app/dist /usr/share/nginx/html
echo.
echo # Copiar configuracao personalizada do nginx
echo COPY nginx.conf /etc/nginx/conf.d/default.conf
echo.
echo # Expor porta 80
echo EXPOSE 80
echo.
echo # Healthcheck
echo HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
echo   CMD wget --quiet --tries=1 --spider http://localhost:80 ^|^| exit 1
echo.
echo # Comando de inicializacao
echo CMD ["nginx", "-g", "daemon off;"]
) > frontend\Dockerfile

echo    - frontend\Dockerfile criado

REM =====================================================
REM Criar nginx.conf do Frontend
REM =====================================================
(
echo server {
echo     listen 80;
echo     server_name localhost;
echo     root /usr/share/nginx/html;
echo     index index.html;
echo.
echo     # Gzip compression
echo     gzip on;
echo     gzip_vary on;
echo     gzip_min_length 1024;
echo     gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;
echo.
echo     # Security headers
echo     add_header X-Frame-Options "SAMEORIGIN" always;
echo     add_header X-Content-Type-Options "nosniff" always;
echo     add_header X-XSS-Protection "1; mode=block" always;
echo.
echo     # Cache static assets
echo     location ~* \.(jpg^|jpeg^|png^|gif^|ico^|css^|js^|svg^|woff^|woff2^|ttf^|eot^)$ {
echo         expires 1y;
echo         add_header Cache-Control "public, immutable";
echo     }
echo.
echo     # SPA routing
echo     location / {
echo         try_files $uri $uri/ /index.html;
echo     }
echo.
echo     # Health check endpoint
echo     location /health {
echo         access_log off;
echo         return 200 "healthy\n";
echo         add_header Content-Type text/plain;
echo     }
echo }
) > frontend\nginx.conf

echo    - frontend\nginx.conf criado

REM =====================================================
REM Criar .dockerignore do Frontend
REM =====================================================
(
echo node_modules
echo npm-debug.log
echo .env
echo .git
echo .DS_Store
echo dist
echo *.log
) > frontend\.dockerignore

echo    - frontend\.dockerignore criado

if not exist frontend\package.json (
    echo.
    echo [AVISO] frontend\package.json nao encontrado!
    echo Voce precisa exportar o projeto do Lovable para a pasta frontend\
    echo.
)

REM =====================================================
REM Criar nginx.conf do Proxy Reverso
REM =====================================================
echo [4/6] Criando configuracao do Nginx Proxy...

(
echo events {
echo     worker_connections 1024;
echo }
echo.
echo http {
echo     upstream backend {
echo         server backend:3001;
echo     }
echo.
echo     upstream frontend {
echo         server frontend:80;
echo     }
echo.
echo     server {
echo         listen 80;
echo         server_name localhost;
echo.
echo         # Frontend
echo         location / {
echo             proxy_pass http://frontend;
echo             proxy_http_version 1.1;
echo             proxy_set_header Host $host;
echo             proxy_set_header X-Real-IP $remote_addr;
echo         }
echo.
echo         # Backend API
echo         location /api/ {
echo             proxy_pass http://backend;
echo             proxy_http_version 1.1;
echo             proxy_set_header Host $host;
echo             proxy_set_header X-Real-IP $remote_addr;
echo         }
echo     }
echo }
) > nginx\nginx.conf

echo    - nginx\nginx.conf criado

REM =====================================================
REM Criar .env.example
REM =====================================================
echo [5/6] Criando .env.example...

(
echo # Supabase
echo SUPABASE_URL=https://seu-projeto.supabase.co
echo SUPABASE_SERVICE_KEY=sua_service_key
echo SUPABASE_ANON_KEY=sua_anon_key
echo.
echo # Mercado Pago
echo MP_ACCESS_TOKEN=seu_access_token
echo MP_PUBLIC_KEY=sua_public_key
echo.
echo # Email
echo EMAIL_HOST=smtp.gmail.com
echo EMAIL_PORT=587
echo EMAIL_USER=seu-email@gmail.com
echo EMAIL_PASS=sua-senha-de-app
echo.
echo # URLs
echo FRONTEND_URL=http://localhost:3000
echo BACKEND_URL=http://localhost:3001
) > .env.example

echo    - .env.example criado

if not exist .env (
    echo.
    echo [AVISO] Arquivo .env nao encontrado!
    echo Criando .env a partir do exemplo...
    copy .env.example .env >nul
    echo    - .env criado (CONFIGURE SUAS CREDENCIAIS!)
)

REM =====================================================
REM Criar .gitignore
REM =====================================================
echo [6/6] Criando .gitignore...

(
echo node_modules/
echo .env
echo .DS_Store
echo npm-debug.log*
echo yarn-debug.log*
echo yarn-error.log*
echo coverage/
echo dist/
echo *.log
echo logs/
) > .gitignore

echo    - .gitignore criado

REM =====================================================
REM Resumo
REM =====================================================
echo.
echo ========================================
echo    Setup Concluido!
echo ========================================
echo.
echo Estrutura criada:
echo   ✓ backend\Dockerfile
echo   ✓ backend\.dockerignore
echo   ✓ frontend\Dockerfile
echo   ✓ frontend\nginx.conf
echo   ✓ frontend\.dockerignore
echo   ✓ nginx\nginx.conf
echo   ✓ .env.example
echo   ✓ .env
echo   ✓ .gitignore
echo.
echo ========================================
echo    Proximos Passos:
echo ========================================
echo.
echo 1. Configure o arquivo .env com suas credenciais
echo    notepad .env
echo.
echo 2. Adicione o codigo do BACKEND na pasta backend\
echo    - server.js
echo    - package.json (ja foi criado um basico)
echo    - outros arquivos .js
echo.
echo 3. Adicione o codigo do FRONTEND na pasta frontend\
echo    - Exporte do Lovable
echo    - Cole todos os arquivos na pasta frontend\
echo.
echo 4. Depois execute:
echo    docker-compose build
echo    docker-compose up -d
echo.
pause