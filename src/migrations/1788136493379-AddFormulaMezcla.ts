import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFormulaMezcla1788136493379 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "productos"
        ADD COLUMN IF NOT EXISTS "porcentaje_clefa" DECIMAL(5,2) NULL,
        ADD COLUMN IF NOT EXISTS "porcentaje_pasta" DECIMAL(5,2) NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "insumos"
        ADD COLUMN IF NOT EXISTS "rol_formula" VARCHAR(10) NULL
          CONSTRAINT "chk_insumos_rol_formula" CHECK ("rol_formula" IN ('clefa', 'pasta'))
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_insumos_rol_formula"
        ON "insumos" ("rol_formula") WHERE "rol_formula" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "kardex_movimientos"
        ADD COLUMN IF NOT EXISTS "origen" VARCHAR(10) NOT NULL DEFAULT 'manual'
          CONSTRAINT "chk_kardex_origen" CHECK ("origen" IN ('manual', 'automatico')),
        ADD COLUMN IF NOT EXISTS "revertido" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "pedido_id" INTEGER NULL
          CONSTRAINT "fk_kardex_pedido" REFERENCES "pedidos" ("id_pedido") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_kardex_pedido_id" ON "kardex_movimientos" ("pedido_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_kardex_pedido_id"`);
    await queryRunner.query(`
      ALTER TABLE "kardex_movimientos"
        DROP COLUMN IF EXISTS "pedido_id",
        DROP COLUMN IF EXISTS "revertido",
        DROP COLUMN IF EXISTS "origen"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_insumos_rol_formula"`);
    await queryRunner.query(`ALTER TABLE "insumos" DROP COLUMN IF EXISTS "rol_formula"`);

    await queryRunner.query(`
      ALTER TABLE "productos"
        DROP COLUMN IF EXISTS "porcentaje_clefa",
        DROP COLUMN IF EXISTS "porcentaje_pasta"
    `);
  }
}
