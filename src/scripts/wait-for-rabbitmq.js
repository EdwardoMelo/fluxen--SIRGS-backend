const { execFile } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);

const PODMAN_CONTAINER = 'equipamentos_sirgs_rabbitmq_podman';
const DOCKER_CONTAINER = 'equipamentos_sirgs_rabbitmq';

async function containerRunning(runtime, name) {
  try {
    const { stdout } = await execFilePromise(runtime, [
      'inspect',
      '-f',
      '{{.State.Running}}',
      name,
    ]);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

async function resolveTarget() {
  const runtime = process.env.RABBITMQ_CONTAINER_RUNTIME;
  const name = process.env.RABBITMQ_CONTAINER_NAME;

  if (runtime && name) {
    return { runtime, name };
  }

  if (await containerRunning('podman', PODMAN_CONTAINER)) {
    return { runtime: 'podman', name: PODMAN_CONTAINER };
  }

  if (await containerRunning('docker', DOCKER_CONTAINER)) {
    return { runtime: 'docker', name: DOCKER_CONTAINER };
  }

  // Preferência desta máquina: Podman (compose/docker podem não existir)
  return {
    runtime: runtime || 'podman',
    name: name || PODMAN_CONTAINER,
  };
}

async function waitForRabbitMQ(maxAttempts = 30, delay = 2000) {
  const { runtime, name } = await resolveTarget();
  console.log(`Aguardando RabbitMQ ficar pronto (${runtime}/${name})...`);

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { stdout } = await execFilePromise(runtime, [
        'exec',
        name,
        'rabbitmq-diagnostics',
        'ping',
      ]);

      if (stdout.includes('Ping succeeded')) {
        console.log('✅ RabbitMQ está pronto!');
        return true;
      }
    } catch {
      if (i < maxAttempts - 1) {
        process.stdout.write(`\rTentativa ${i + 1}/${maxAttempts}...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.log('\n⚠️  RabbitMQ não ficou pronto a tempo, continuando mesmo assim...');
  return false;
}

waitForRabbitMQ()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
