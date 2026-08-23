import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndicesPedidos1787521386492 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pedidos_cliente_id" ON "pedidos" ("cliente_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pedidos_fecha_creacion" ON "pedidos" ("fecha_creacion")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pedidos_token_seguimiento" ON "pedidos" ("token_seguimiento")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pedidos_cliente_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pedidos_fecha_creacion"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pedidos_token_seguimiento"`);
  }
}
