import '../loadEnv';
import { rabbitMQService } from '../services/rabbitmqService';
import { EquipamentoLogService } from '../services/equipamentoLogService';
import { ReportService } from '../services/reportService';
import { emailService } from '../services/emailService';
import { logError, logInfo } from '../utils/logger';
import { prisma } from '../database';

const equipamentoLogService = new EquipamentoLogService();
const reportService = new ReportService();

async function processLogs(data: any): Promise<void> {
    try {
        const equipamentoId = data.logs?.[0]?.id_equipamento;
        const logsCount = Array.isArray(data?.logs) ? data.logs.length : 0;

        logInfo('logsWorker received logs from queue', {
            equipamentoId,
            logsCount
        });

        // Obter tenantId do equipamento
        let tenantId: number | undefined;
        if (equipamentoId) {
            const equipamento = await prisma.equipamento.findUnique({
                where: { id: equipamentoId },
                select: { id_tenant: true }
            });
            if (equipamento?.id_tenant) {
                tenantId = equipamento.id_tenant;
            }
        }
        
        await equipamentoLogService.createManyEquipamentoLogs(data, tenantId);
        logInfo('logsWorker persisted logs in database', {
            equipamentoId,
            tenantId,
            logsCount
        });

        if (equipamentoId) {
            await rabbitMQService.publishDashboardBundleRefresh({
                id_equipamento: equipamentoId,
                trigger: 'logs',
                created_at: new Date().toISOString()
            });
            logInfo('logsWorker published dashboard bundle refresh event', {
                equipamentoId
            });
        }
    } catch (error) {
        logError('Failed to process logs from queue', error);
        throw error; // Isso fará o retry automático
    }
}

async function processReportRequest(data: any): Promise<void> {
    try {
        const { id_equipamento, userId, startDate, endDate, format, email } = data;

        // Validar email
        if (!email) {
            throw new Error('Email is required for report delivery');
        }

        // Buscar equipamento para obter nome
        const equipamento = await prisma.equipamento.findUnique({
            where: { id: id_equipamento },
            select: { nome: true }
        });

        if (!equipamento) {
            throw new Error(`Equipamento ${id_equipamento} not found`);
        }

        // Converter datas
        const start = new Date(startDate);
        const end = new Date(endDate);

        // Gerar relatório
        let fileBuffer: Buffer;
        if (format === 'xlsx') {
            fileBuffer = await reportService.generateXLSXReport(id_equipamento, start, end);
        } else if (format === 'pdf') {
            fileBuffer = await reportService.generatePDFReport(id_equipamento, start, end);
        } else {
            throw new Error(`Unsupported format: ${format}`);
        }

        // Enviar por email
        await emailService.sendReportEmail(
            email,
            equipamento.nome,
            start,
            end,
            format,
            fileBuffer
        );
    } catch (error) {
        logError('Failed to process report request from queue', error);
        throw error; // Isso fará o retry automático
    }
}

async function startWorker() {
    try {
        logInfo('logsWorker starting (RabbitMQ consumers first; email warmup non-blocking)');

        // Conectar ao RabbitMQ e registrar consumidores ANTES de qualquer coisa que possa travar (ex.: SMTP verify).
        // O initialize() do email chama transporter.verify() e pode demorar ou pendurar — isso não pode impedir o consumo de logs.
        await rabbitMQService.connect();
        logInfo('logsWorker connected to RabbitMQ');

        await rabbitMQService.consumeLogs(processLogs);
        logInfo('logsWorker registered consumer for equipamento_logs');

        await rabbitMQService.consumeReportRequests(processReportRequest);
        logInfo('logsWorker registered consumer for report_requests');

        if (emailService.isConfigured()) {
            void emailService.initialize().catch((err) => {
                logError('Email service verify failed in background; first report send may retry init', err);
            });
        } else {
            logError('Email service not configured. Reports will not be sent.', new Error('Email configuration missing'));
        }

        logInfo('logsWorker is ready');
    } catch (error) {
        logError('Failed to start logs worker', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    await rabbitMQService.close();
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await rabbitMQService.close();
    await prisma.$disconnect();
    process.exit(0);
});

// Iniciar worker
startWorker();