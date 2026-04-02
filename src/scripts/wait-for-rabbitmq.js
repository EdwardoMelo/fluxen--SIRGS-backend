const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const containerRuntime = process.env.RABBITMQ_CONTAINER_RUNTIME || 'docker';
const containerName =
  process.env.RABBITMQ_CONTAINER_NAME || 'equipamentos_sirgs_rabbitmq';

async function waitForRabbitMQ(maxAttempts = 30, delay = 2000) {
  console.log('Aguardando RabbitMQ ficar pronto...');
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Tenta conectar no RabbitMQ
      const { stdout } = await execPromise(
        `${containerRuntime} exec ${containerName} rabbitmq-diagnostics ping`
      );

      console.log({ stdout });
      
      if (stdout.includes('Ping succeeded')) {
        console.log('✅ RabbitMQ está pronto!');
        return true;
      }
    } catch (error) {
      // RabbitMQ ainda não está pronto
      if (i < maxAttempts - 1) {
        process.stdout.write(`\rTentativa ${i + 1}/${maxAttempts}...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.log('\n⚠️  RabbitMQ não ficou pronto a tempo, continuando mesmo assim...');
  return false;
}

waitForRabbitMQ()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));