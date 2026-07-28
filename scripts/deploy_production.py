#!/usr/bin/env python3
import os
import sys
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("Dependency missing: paramiko")
    print("Install with: pip install paramiko")
    sys.exit(1)


def load_dotenv(env_path: Path) -> None:
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


GIT_REMOTE = "origin"
DEPLOY_BRANCH = "qa"

# Must match `name` entries in ecosystem.config.js
PM2_APP_NAMES = ("sirgs-api", "sirgs-worker", "sirgs-dashboard-worker")
RABBITMQ_CONTAINER = "equipamentos_sirgs_rabbitmq"
RABBITMQ_READY_ATTEMPTS = 30
RABBITMQ_READY_DELAY_SECONDS = 2


def remote_git_update_command() -> str:
    """Fetch from origin and align local branch to origin/qa (explicit remote + branch)."""
    b = DEPLOY_BRANCH
    r = GIT_REMOTE
    return f"git fetch {r} {b} && git checkout -B {b} {r}/{b}"


def remote_rabbitmq_up_command() -> str:
    """Ensure RabbitMQ is running before PM2 workers start (they exit if AMQP is down)."""
    return (
        "docker compose up -d "
        f"&& echo 'Waiting for RabbitMQ ({RABBITMQ_CONTAINER})...' "
        f"&& i=1 "
        f"&& while [ $i -le {RABBITMQ_READY_ATTEMPTS} ]; do "
        f"if docker exec {RABBITMQ_CONTAINER} rabbitmq-diagnostics -q ping >/dev/null 2>&1; then "
        "echo 'RabbitMQ is ready'; "
        "break; "
        "fi; "
        f'echo "RabbitMQ not ready yet ($i/{RABBITMQ_READY_ATTEMPTS})"; '
        f"sleep {RABBITMQ_READY_DELAY_SECONDS}; "
        "i=$((i + 1)); "
        "done "
        f"&& if [ $i -gt {RABBITMQ_READY_ATTEMPTS} ]; then "
        "echo 'RabbitMQ did not become ready in time' >&2; "
        "exit 1; "
        "fi"
    )


def remote_pm2_sync_command() -> str:
    """Restart each app if already in PM2; otherwise start it from ecosystem.config.js."""
    names = " ".join(PM2_APP_NAMES)
    return (
        f"for name in {names}; do "
        'if pm2 describe "$name" >/dev/null 2>&1; then pm2 restart "$name"; '
        'else pm2 start ecosystem.config.js --only "$name"; fi; done'
    )


def main() -> int:
    project_root = Path(__file__).resolve().parents[1]
    load_dotenv(project_root / ".env")

    host = required_env("VPS_IP")
    password = required_env("VPS_SSH_PASSWORD")
    backend_path = required_env("VPS_BACKEND_PATH")
    user = os.environ.get("VPS_SSH_USER", "root").strip() or "root"
    port = int(os.environ.get("VPS_SSH_PORT", "22"))

    remote_command = " && ".join(
        [
            f"cd {backend_path}",
            remote_git_update_command(),
            "npm ci",
            "npx prisma generate",
            "npm run build",
            remote_rabbitmq_up_command(),
            remote_pm2_sync_command(),
        ]
    )

    print(f"Connecting to {user}@{host}:{port} ...")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        client.connect(
            hostname=host,
            port=port,
            username=user,
            password=password,
            timeout=20,
            look_for_keys=False,
            allow_agent=False,
        )

        print("Running remote deploy steps...")
        stdin, stdout, stderr = client.exec_command(remote_command)
        _ = stdin

        out_text = stdout.read().decode("utf-8", errors="replace")
        err_text = stderr.read().decode("utf-8", errors="replace")
        exit_code = stdout.channel.recv_exit_status()

        if out_text.strip():
            print("\n--- STDOUT ---")
            print(out_text.rstrip())
        if err_text.strip():
            print("\n--- STDERR ---")
            print(err_text.rstrip())

        if exit_code != 0:
            print(f"\nDeploy failed with exit code {exit_code}")
            return exit_code

        print("\nDeploy finished successfully.")
        return 0
    except Exception as exc:
        print(f"Deploy error: {exc}")
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
