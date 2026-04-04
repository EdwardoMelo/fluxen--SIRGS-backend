import { connect, Connection, Channel } from 'amqplib-as-promised';
import { logError } from '../utils/logger';

class RabbitMQService {
    private connection: Connection | null = null;
    private channel: Channel | null = null;
    // Nome da fila principal onde as mensagens de logs de equipamentos serão enviadas e consumidas.
    private readonly queueName = 'equipamento_logs';

    // Nome da exchange RabbitMQ para rotear mensagens entre as filas (principal, retry e dead-letter).
    private readonly exchangeName = 'equipamento_logs_exchange';

    // Nome da fila de retry, para onde vão mensagens que falharam temporariamente (serão reprocessadas após um tempo).
    private readonly retryQueueName = 'equipamento_logs_retry';

    // Nome da fila dead letter (DLQ). Mensagens que não puderam ser processadas/reprocessadas vão para cá para análise posterior.
    private readonly deadLetterQueueName = 'equipamento_logs_dlq';

    // Filas para relatórios
    private readonly reportQueueName = 'report_requests';
    private readonly reportExchangeName = 'report_requests_exchange';
    private readonly reportRetryQueueName = 'report_requests_retry';
    private readonly reportDeadLetterQueueName = 'report_requests_dlq';

    async connect(): Promise<void> {
        try {
            const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin123@localhost:5672';
            this.connection = await connect(rabbitmqUrl);
            if (!this.connection) {
                throw new Error('Failed to connect to RabbitMQ');
            }
            this.channel = await this.connection.createChannel();
            // Criar exchange
            await this.channel.assertExchange(this.exchangeName, 'direct', {
                durable: true
            });
            // Criar fila principal com dead letter queue
            await this.channel.assertQueue(this.queueName, {
                durable: true,
                arguments: {
                    'x-dead-letter-exchange': this.exchangeName,
                    'x-dead-letter-routing-key': this.deadLetterQueueName,
                    'x-message-ttl': 300000 // 5 minutos
                }
            });
            // Criar fila de retry
            await this.channel.assertQueue(this.retryQueueName, {
                durable: true,
                arguments: {
                    'x-dead-letter-exchange': this.exchangeName,
                    'x-dead-letter-routing-key': this.queueName,
                    'x-message-ttl': 60000 // 1 minuto
                }
            });
            // Criar dead letter queue
            await this.channel.assertQueue(this.deadLetterQueueName, {
                durable: true
            });
            await this.channel.bindQueue(this.queueName, this.exchangeName, this.queueName); // liga a fila principal à exchange para logs normais
            await this.channel.bindQueue(this.retryQueueName, this.exchangeName, this.retryQueueName); // liga a fila de retry para reprocessamento
            await this.channel.bindQueue(this.deadLetterQueueName, this.exchangeName, this.deadLetterQueueName); // liga a DLQ para mensagens mortas/falhas definitivas

            // Criar exchange para relatórios
            await this.channel.assertExchange(this.reportExchangeName, 'direct', {
                durable: true
            });
            // Criar fila principal de relatórios
            await this.channel.assertQueue(this.reportQueueName, {
                durable: true,
                arguments: {
                    'x-dead-letter-exchange': this.reportExchangeName,
                    'x-dead-letter-routing-key': this.reportDeadLetterQueueName,
                    'x-message-ttl': 3600000 // 1 hora
                }
            });
            // Criar fila de retry para relatórios
            await this.channel.assertQueue(this.reportRetryQueueName, {
                durable: true,
                arguments: {
                    'x-dead-letter-exchange': this.reportExchangeName,
                    'x-dead-letter-routing-key': this.reportQueueName,
                    'x-message-ttl': 300000 // 5 minutos
                }
            });
            // Criar dead letter queue para relatórios
            await this.channel.assertQueue(this.reportDeadLetterQueueName, {
                durable: true
            });
            await this.channel.bindQueue(this.reportQueueName, this.reportExchangeName, this.reportQueueName);
            await this.channel.bindQueue(this.reportRetryQueueName, this.reportExchangeName, this.reportRetryQueueName);
            await this.channel.bindQueue(this.reportDeadLetterQueueName, this.reportExchangeName, this.reportDeadLetterQueueName);

        } catch (error) {
            logError('Failed to connect to RabbitMQ', error);
            throw error;
        }
    }

    async publishLogs(data: any): Promise<boolean> {
        if (!this.channel) {
            throw new Error('RabbitMQ channel not initialized');
        }

        try {
            const message = Buffer.from(JSON.stringify(data));
            const published = this.channel.publish(
                this.exchangeName,
                this.queueName,
                message,
                {
                    persistent: true,
                    timestamp: Date.now()
                }
            );
            return published !== null && published !== undefined ? true : false;
        } catch (error) {
            logError('Failed to publish logs to RabbitMQ', error);
            throw error;
        }
    }

    async consumeLogs(operation: (data: any) => Promise<void>): Promise<void> {
        if (!this.channel) {
            throw new Error('RabbitMQ channel not initialized');
        }

        await this.channel.prefetch(10); // Processar até 10 mensagens por vez

        await this.channel.consume(this.queueName, async (message) => {
            if (!message) return;

            try {
                const data = JSON.parse(message.content.toString());
                await operation(data);
                // Acknowledge após processamento bem-sucedido
                this.channel?.ack(message);
            } catch (error) {
                logError('Failed to process logs from queue', error);
                // Verificar número de tentativas
                const retryCount = message.properties.headers?.['x-retry-count'] || 0;
                if (retryCount < 5) {
                    // Reenviar para fila de retry
                    if (this.channel) {
                        this.channel.publish(
                            this.exchangeName,
                            this.retryQueueName,
                            message.content,
                            {
                                persistent: true,
                                headers: {
                                    'x-retry-count': retryCount + 1
                                }
                            }
                        );
                    }
                    this.channel?.ack(message);
                } else {
                    // Mover para dead letter queue após 3 tentativas
                    logError('Message moved to DLQ after max retries', { retryCount });
                    this.channel?.nack(message, false, false);
                }
            }
        }, {
            noAck: false
        });
    }

    async close(): Promise<void> {
        try {
            if (this.channel) {
                await this.channel.close();
            }
            if (this.connection) {
                await this.connection.close();
            }
        } catch (error) {
            logError('Error closing RabbitMQ connection', error);
        }
    }

    /**
     * Publica uma requisição de relatório na fila
     */
    async publishReportRequest(data: any): Promise<boolean> {
        if (!this.channel) {
            throw new Error('RabbitMQ channel not initialized');
        }

        try {
            const message = Buffer.from(JSON.stringify(data));
            const published = this.channel.publish(
                this.reportExchangeName,
                this.reportQueueName,
                message,
                {
                    persistent: true,
                    timestamp: Date.now()
                }
            );
            return published !== null && published !== undefined ? true : false;
        } catch (error) {
            logError('Failed to publish report request to RabbitMQ', error);
            throw error;
        }
    }

    /**
     * Consome requisições de relatórios da fila
     */
    async consumeReportRequests(operation: (data: any) => Promise<void>): Promise<void> {
        if (!this.channel) {
            throw new Error('RabbitMQ channel not initialized');
        }

        await this.channel.prefetch(5); // Processar até 5 relatórios por vez (são mais pesados)

        await this.channel.consume(this.reportQueueName, async (message) => {
            if (!message) return;

            try {
                const data = JSON.parse(message.content.toString());
                await operation(data);
                // Acknowledge após processamento bem-sucedido
                this.channel?.ack(message);
            } catch (error) {
                logError('Failed to process report request from queue', error);
                // Verificar número de tentativas
                const retryCount = message.properties.headers?.['x-retry-count'] || 0;
                if (retryCount < 3) {
                    // Reenviar para fila de retry
                    if (this.channel) {
                        this.channel.publish(
                            this.reportExchangeName,
                            this.reportRetryQueueName,
                            message.content,
                            {
                                persistent: true,
                                headers: {
                                    'x-retry-count': retryCount + 1
                                }
                            }
                        );
                    }
                    this.channel?.ack(message);
                } else {
                    // Mover para dead letter queue após 3 tentativas
                    logError('Report request moved to DLQ after max retries', { retryCount });
                    this.channel?.nack(message, false, false);
                }
            }
        }, {
            noAck: false
        });
    }

    isConnected(): boolean {
        return this.connection !== null && this.channel !== null;
    }
}

export const rabbitMQService = new RabbitMQService();