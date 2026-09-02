import { MigrationInterface, QueryRunner } from 'typeorm';

// Referencia directa (no rol_formula) al insumo de cuero específico que usa
// cada producto en Cortado — se elige desde un desplegable en el frontend,
// no se resuelve por convención. FK simple sin ON DELETE: Postgres usa
// NO ACTION por defecto, bloqueando el borrado de un insumo referenciado
// (mismo comportamiento que ya protege a Producto vía pedidos.producto_id).
export class AddCueroInsumoIdProducto1788309210061 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "productos"
        ADD COLUMN IF NOT EXISTS "cuero_insumo_id" INTEGER NULL
          REFERENCES "insumos"("id_insumo")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "productos" DROP COLUMN IF EXISTS "cuero_insumo_id"
    `);
  }
}
