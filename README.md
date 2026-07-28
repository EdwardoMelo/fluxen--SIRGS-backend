# Fluxen Backend

API REST desenvolvida em Node.js com TypeScript para o sistema de monitoramento de equipamentos Fluxen. O backend fornece uma arquitetura robusta com suporte a multi-tenancy, processamento assíncrono de logs, autenticação JWT e integração com RabbitMQ.

## 📋 Índice

- [Tecnologias](#-tecnologias)
- [Pré-requisitos](#-pré-requisitos)
- [Instalação](#-instalação)
- [Configuração](#-configuração)
- [Executando o Projeto](#-executando-o-projeto)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Arquitetura](#-arquitetura)
- [Banco de Dados](#-banco-de-dados)
- [API Endpoints](#-api-endpoints)
- [Scripts Disponíveis](#-scripts-disponíveis)
- [Deploy](#-deploy)

## 🚀 Tecnologias

- **Node.js** - Runtime JavaScript
- **TypeScript** - Superset JavaScript com tipagem estática
- **Express** - Framework web para Node.js
- **Prisma** - ORM moderno para TypeScript
- **MySQL** - Banco de dados relacional
- **RabbitMQ** - Message broker para processamento assíncrono
- **JWT** - Autenticação baseada em tokens
- **bcrypt** - Hash de senhas
- **Winston** - Sistema de logging
- **Nodemailer** - Envio de emails
- **ExcelJS** - Geração de relatórios Excel
- **PDFKit** - Geração de relatórios PDF

## 📦 Pré-requisitos

Antes de começar, certifique-se de ter instalado:

- **Node.js** (versão 18 ou superior)
- **npm** ou **yarn**
- **Podman** (para RabbitMQ em desenvolvimento local)
- **MySQL** (local ou remoto)
- **Git**

## 🔧 Instalação

1. Clone o repositório:
```bash
git clone <url-do-repositorio>
cd fluxen-backend
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente (veja seção [Configuração](#-configuração))

4. Configure o banco de dados:
```bash
# Gerar o Prisma Client
npx prisma generate

# Executar as migrações
npx prisma migrate deploy
```

## ⚙️ Configuração

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Servidor
PORT=3000
NODE_ENV=development

# Banco de Dados
DATABASE_URL=mysql://usuario:senha@localhost:3306/fluxen_db

# JWT
JWT_SECRET=sua_chave_secreta_jwt_aqui
JWT_EXPIRES_IN=24h

# RabbitMQ (opcional - usado para processamento assíncrono)
RABBITMQ_URL=amqp://admin:admin123@localhost:5672

# Email (para recuperação de senha e notificações)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=seu_email@gmail.com
EMAIL_PASS=sua_senha_de_app
EMAIL_FROM=noreply@fluxen.com

# Frontend URL (para CORS)
FRONTEND_URL=http://localhost:5173
```

### Variáveis Importantes

- **DATABASE_URL**: String de conexão do MySQL no formato `mysql://usuario:senha@host:porta/database`
- **JWT_SECRET**: Chave secreta para assinatura dos tokens JWT (use uma string aleatória e segura)
- **RABBITMQ_URL**: URL de conexão do RabbitMQ (opcional, mas recomendado para produção)

## 🏃 Executando o Projeto

### Modo Desenvolvimento

O modo desenvolvimento inicia automaticamente o RabbitMQ via Podman e executa tanto a API quanto o Worker:

```bash
npm run dev
```

Este comando:
- Inicia o RabbitMQ via Podman
- Aguarda o RabbitMQ estar pronto
- Inicia a API em modo watch (com hot reload)
- Inicia o Worker em modo watch (processamento de logs)

### Modo Produção

1. Compile o TypeScript:
```bash
npm run build
```

2. Inicie os serviços:
```bash
npm start
```

Ou usando PM2 (recomendado para produção):
```bash
npm run start:pm2
```

### Comandos Individuais

```bash
# Apenas a API em desenvolvimento
npm run dev:api

# Apenas o Worker em desenvolvimento
npm run dev:worker

# Apenas a API em produção
npm run start:api

# Apenas o Worker em produção
npm run start:worker
```

### RabbitMQ (Podman / Docker)

```bash
# Iniciar RabbitMQ (Podman — padrão local)
npm run podman:up

# Parar RabbitMQ
npm run podman:down

# Ver logs do RabbitMQ
npm run podman:logs

# Alternativa com Docker Compose (se Docker estiver instalado)
npm run docker:up
npm run docker:down
npm run docker:logs
```

O RabbitMQ Management UI estará disponível em: `http://localhost:15672`
- Usuário: `admin`
- Senha: `admin123`

## 📁 Estrutura do Projeto

```
fluxen-backend/
├── src/
│   ├── controllers/        # Controladores (lógica de requisições HTTP)
│   ├── services/           # Serviços (lógica de negócio)
│   ├── repositories/       # Repositórios (acesso ao banco de dados)
│   ├── routers/            # Rotas da API
│   ├── middlewares/        # Middlewares (autenticação, validação, etc.)
│   ├── dto/                # Data Transfer Objects
│   ├── types/              # Definições de tipos TypeScript
│   ├── utils/              # Utilitários (logger, helpers)
│   ├── workers/            # Workers para processamento assíncrono
│   ├── database.ts         # Configuração do Prisma
│   └── index.ts            # Ponto de entrada da aplicação
├── prisma/
│   ├── schema.prisma       # Schema do banco de dados
│   └── migrations/         # Migrações do banco de dados
├── migrations/             # Migrações SQL manuais
├── dist/                   # Código compilado (TypeScript → JavaScript)
├── docker-compose.yml      # Configuração do RabbitMQ
├── ecosystem.config.js     # Configuração do PM2
├── tsconfig.json           # Configuração do TypeScript
└── package.json            # Dependências e scripts
```

## 🏗️ Arquitetura

O projeto segue uma arquitetura em camadas:

### Camadas

1. **Routers** (`routers/`): Define as rotas HTTP e delega para os controllers
2. **Controllers** (`controllers/`): Recebe requisições HTTP, valida dados e chama services
3. **Services** (`services/`): Contém a lógica de negócio
4. **Repositories** (`repositories/`): Abstrai o acesso ao banco de dados via Prisma
5. **Workers** (`workers/`): Processa tarefas assíncronas (logs de equipamentos)

### Fluxo de uma Requisição

```
Cliente → Router → Middleware (Auth/Validação) → Controller → Service → Repository → Database
                                                                    ↓
                                                              Response ← Controller ← Service ← Repository
```

### Multi-Tenancy

O sistema suporta multi-tenancy através do header `X-Tenant-Id` em todas as requisições. O middleware de autenticação valida e injeta o `id_tenant` do usuário automaticamente.

### Processamento Assíncrono

Logs de equipamentos são processados de forma assíncrona usando RabbitMQ:
- A API recebe os logs e publica na fila
- O Worker consome a fila e processa os logs
- Isso garante que a API não trave com grandes volumes de dados

## 🗄️ Banco de Dados

O projeto usa **Prisma ORM** para gerenciar o banco de dados MySQL.

### Principais Entidades

- **usuario**: Usuários do sistema
- **cliente**: Clientes/empresas
- **equipamento**: Equipamentos monitorados
- **metrica**: Métricas que podem ser monitoradas
- **equipamento_metricas**: Relação entre equipamentos e métricas
- **equipamento_log_grupo**: Logs agregados dos equipamentos
- **notificacao**: Notificações para usuários
- **tenant**: Organizações multi-tenant

### Comandos Prisma

```bash
# Gerar Prisma Client
npx prisma generate

# Criar nova migração
npx prisma migrate dev --name nome_da_migracao

# Aplicar migrações
npx prisma migrate deploy

# Visualizar banco no Prisma Studio
npx prisma studio

# Resetar banco (CUIDADO: apaga todos os dados)
npx prisma migrate reset
```

## 🔌 API Endpoints

A API está disponível em `/api`. Principais rotas:

### Autenticação
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Registro
- `POST /api/auth/forgot-password` - Solicitar recuperação de senha
- `POST /api/auth/reset-password` - Redefinir senha

### Equipamentos
- `GET /api/equipamentos` - Listar equipamentos
- `POST /api/equipamentos` - Criar equipamento
- `GET /api/equipamentos/:id` - Obter equipamento
- `PUT /api/equipamentos/:id` - Atualizar equipamento
- `DELETE /api/equipamentos/:id` - Deletar equipamento

### Logs
- `POST /api/equipamentos/:id/logs` - Enviar logs do equipamento
- `GET /api/equipamentos/:id/logs` - Obter logs do equipamento

### Métricas
- `GET /api/metricas` - Listar métricas
- `POST /api/metricas` - Criar métrica

### Clientes
- `GET /api/clientes` - Listar clientes
- `POST /api/clientes` - Criar cliente

### Usuários
- `GET /api/usuarios` - Listar usuários
- `POST /api/usuarios` - Criar usuário

### Notificações
- `GET /api/notificacoes` - Listar notificações
- `PUT /api/notificacoes/:id/visualizar` - Marcar como visualizada

### Relatórios
- `GET /api/reports/equipamentos/:id` - Gerar relatório de equipamento

### Gráficos
- `GET /api/charts/equipamento/:id` - Dados para gráficos

> **Nota**: A maioria das rotas requer autenticação via token JWT no header `Authorization: Bearer <token>`

## 📜 Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev              # Inicia API + Worker em modo desenvolvimento
npm run dev:api         # Apenas API em desenvolvimento
npm run dev:worker      # Apenas Worker em desenvolvimento

# Produção
npm run build           # Compila TypeScript
npm start               # Inicia API + Worker em produção
npm run start:api       # Apenas API em produção
npm run start:worker    # Apenas Worker em produção

# PM2 (Process Manager)
npm run start:pm2       # Inicia com PM2
npm run pm2:start       # Inicia PM2
npm run pm2:stop        # Para PM2
npm run pm2:restart     # Reinicia PM2
npm run pm2:logs        # Ver logs do PM2
npm run pm2:status      # Status dos processos

# Podman (RabbitMQ local)
npm run podman:up       # Inicia RabbitMQ
npm run podman:down     # Para RabbitMQ
npm run podman:logs     # Logs do RabbitMQ
```

## 🚢 Deploy

### Preparação

1. Configure todas as variáveis de ambiente no servidor
2. Compile o projeto: `npm run build`
3. Execute as migrações: `npx prisma migrate deploy`
4. Certifique-se de que o RabbitMQ está rodando

### Opções de Deploy

#### PM2 (Recomendado)

```bash
npm run start:pm2
```

#### Docker

Crie um `Dockerfile` de produção e use docker-compose para orquestrar todos os serviços.

#### Serviços Gerenciados

- **API**: Pode ser deployada em serviços como Heroku, Railway, AWS, etc.
- **Worker**: Deve rodar separadamente (pode usar PM2 ou containers separados)
- **Database**: MySQL gerenciado (AWS RDS, PlanetScale, etc.)
- **RabbitMQ**: Serviço gerenciado ou container

## 📝 Notas Adicionais

- O sistema usa **Winston** para logging estruturado
- Logs são salvos em arquivos e também exibidos no console
- O sistema suporta **multi-tenancy** através do header `X-Tenant-Id`
- Workers processam logs de forma assíncrona para melhor performance
- A autenticação usa **JWT** com expiração configurável
- Senhas são hasheadas com **bcrypt** antes de serem armazenadas

## 🤝 Contribuindo

1. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
2. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
3. Push para a branch (`git push origin feature/AmazingFeature`)
4. Abra um Pull Request

## 📄 Licença

Este projeto é proprietário e confidencial.

---

**Desenvolvido com ❤️ para Fluxen**
