const { execFileSync, spawn } = require('child_process');

const CONTAINER = 'equipamentos_sirgs_rabbitmq_podman';
const VOLUME = 'rabbitmq_data_podman';
const IMAGE = 'rabbitmq:3.12-management-alpine';

function podman(args, { inherit = false } = {}) {
  return execFileSync('podman', args, {
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
}

function containerExists() {
  try {
    podman(['inspect', CONTAINER]);
    return true;
  } catch {
    return false;
  }
}

function isRunning() {
  try {
    return podman(['inspect', '-f', '{{.State.Running}}', CONTAINER]).trim() === 'true';
  } catch {
    return false;
  }
}

function ensureVolume() {
  try {
    podman(['volume', 'inspect', VOLUME]);
  } catch {
    console.log(`Criando volume ${VOLUME}...`);
    podman(['volume', 'create', VOLUME], { inherit: true });
  }
}

function up() {
  if (isRunning()) {
    console.log(`RabbitMQ já está em execução (${CONTAINER})`);
    return;
  }

  if (containerExists()) {
    console.log(`Iniciando container existente ${CONTAINER}...`);
    podman(['start', CONTAINER], { inherit: true });
    return;
  }

  ensureVolume();
  console.log(`Criando e iniciando ${CONTAINER}...`);
  podman(
    [
      'run',
      '-d',
      '--name',
      CONTAINER,
      '--restart',
      'unless-stopped',
      '-e',
      'RABBITMQ_DEFAULT_USER=admin',
      '-e',
      'RABBITMQ_DEFAULT_PASS=admin123',
      '-p',
      '5672:5672',
      '-p',
      '15672:15672',
      '-v',
      `${VOLUME}:/var/lib/rabbitmq`,
      IMAGE,
    ],
    { inherit: true }
  );
}

function down() {
  if (!containerExists()) {
    console.log(`Container ${CONTAINER} não encontrado`);
    return;
  }

  try {
    podman(['stop', CONTAINER], { inherit: true });
  } catch {
    // já parado
  }

  podman(['rm', CONTAINER], { inherit: true });
}

function logs() {
  const child = spawn('podman', ['logs', '-f', CONTAINER], {
    stdio: 'inherit',
    shell: false,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

const command = process.argv[2];

switch (command) {
  case 'up':
    up();
    break;
  case 'down':
    down();
    break;
  case 'logs':
    logs();
    break;
  default:
    console.error('Uso: node src/scripts/podman-rabbitmq.js <up|down|logs>');
    process.exit(1);
}
