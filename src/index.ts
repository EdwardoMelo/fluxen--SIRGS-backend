import './loadEnv';
import express from 'express';
import { prisma } from './database';
import authRouter from './routers/authRouter';
import clienteRouter from './routers/clienteRouter';
import equipamentoLogRouter from './routers/equipamentoLogRouter';
import equipamentoMetricaRouter from './routers/equipamentoMetricaRouter';
import equipamentoRouter from './routers/equipamentoRouter';
import metricaRouter from './routers/metricaRouter';
import perfilRouter from './routers/usarioPerfilRouter';
import usuarioPerfilRouter from './routers/usarioPerfilRouter';
import usuarioRouter from './routers/usuarioRouter';
import usuarioPerfilClienteRouter from './routers/usuarioPerfilClienteRouter';
import usuarioEquipamentoDashboardRouter from './routers/usuarioEquipamentoDashboardRouter';
import chartRouter from './routers/chartRouter';
import notificacaoRouter from './routers/notificacaoRouter';
import reportRouter from './routers/reportRouter';
import supportRouter from './routers/supportRouter';
import systemAnnouncementRouter from './routers/systemAnnouncementRouter';
import landingContactRouter from './routers/landingContactRouter';
import cors from "cors";
import morgan from "morgan";
import { logError, logWarn } from './utils/logger';
import { rabbitMQService } from './services/rabbitmqService';

const app = express();

// Configuração de CORS - permite requisições de qualquer origem
app.use(
  cors({
    origin: true, // Permite qualquer origem
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "X-Tenant-Id"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'tiny'));

app.use(express.json());

app.get('/', (req, res) => {
  res.send('API is running')
});

// Test database connection
prisma.$connect().catch((error) => {
  logError('Database connection failed', error);
});

// Apply routers
app.use('/api', authRouter);
app.use('/api', clienteRouter);
app.use('/api', equipamentoLogRouter);
app.use('/api', equipamentoMetricaRouter);
app.use('/api', equipamentoRouter);
app.use('/api', metricaRouter);
app.use('/api', perfilRouter);
app.use('/api', usuarioPerfilRouter);
app.use('/api', usuarioRouter);
app.use('/api', usuarioPerfilClienteRouter);
app.use('/api', usuarioEquipamentoDashboardRouter);
app.use('/api', chartRouter);
app.use('/api', notificacaoRouter);
app.use('/api', reportRouter);
app.use('/api', supportRouter);
app.use('/api', systemAnnouncementRouter);
app.use('/api', landingContactRouter);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT);

rabbitMQService.connect().catch((error) => {
  logWarn('RabbitMQ connection failed - will use direct processing', error);
});