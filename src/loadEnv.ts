import { config } from 'dotenv';
import path from 'node:path';

/** Carrega `.env` da raiz do projeto antes de outros módulos (workers não herdavam LOG_LEVEL sem isso). */
config({ path: path.resolve(process.cwd(), '.env') });
