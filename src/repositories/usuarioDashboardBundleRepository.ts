import { prisma } from '../database';

export interface UsuarioDashboardBundleRecord {
  id: number;
  id_tenant: number | null;
  id_usuario: number;
  bundle_json: unknown;
  schema_version: number;
  source: string | null;
  updated_at: Date;
  created_at: Date;
}

export class UsuarioDashboardBundleRepository {
  async findByUsuarioId(id_usuario: number): Promise<UsuarioDashboardBundleRecord | null> {
    const rows = await prisma.$queryRaw<UsuarioDashboardBundleRecord[]>`
      SELECT
        id,
        id_tenant,
        id_usuario,
        bundle_json,
        schema_version,
        source,
        updated_at,
        created_at
      FROM usuario_dashboard_bundle
      WHERE id_usuario = ${id_usuario}
      LIMIT 1
    `;

    if (!rows.length) {
      return null;
    }
    return rows[0];
  }

  async upsertByUsuarioId(
    id_usuario: number,
    id_tenant: number | null,
    bundle: unknown,
    source: string,
    schemaVersion = 1
  ): Promise<void> {
    const bundleJson = JSON.stringify(bundle);

    await prisma.$executeRaw`
      INSERT INTO usuario_dashboard_bundle (id_tenant, id_usuario, bundle_json, schema_version, source, created_at, updated_at)
      VALUES (${id_tenant}, ${id_usuario}, CAST(${bundleJson} AS JSON), ${schemaVersion}, ${source}, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        id_tenant = VALUES(id_tenant),
        bundle_json = VALUES(bundle_json),
        schema_version = VALUES(schema_version),
        source = VALUES(source),
        updated_at = NOW()
    `;
  }
}

