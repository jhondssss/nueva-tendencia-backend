import { MigrationInterface, QueryRunner } from 'typeorm';

// Corrección de diseño: el tipo de cuero lo elige el cliente al hacer un
// pedido puntual, no es una característica fija del producto — cuero_insumo_id
// se mueve de productos a pedidos. Ningún producto llegó a tener este campo
// cargado con dato real, así que se puede dropear sin migrar datos.
// Mismo patrón que la migración original: FK sin ON DELETE, Postgres usa
// NO ACTION por defecto y bloquea el borrado de un insumo referenciado.
export class MoveCueroInsumoIdToPedido1788309210063 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pedidos"
        ADD COLUMN IF NOT EXISTS "cuero_insumo_id" INTEGER NULL
          REFERENCES "insumos"("id_insumo")
    `);

    await queryRunner.query(`
      ALTER TABLE "productos" DROP COLUMN IF EXISTS "cuero_insumo_id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "productos"
        ADD COLUMN IF NOT EXISTS "cuero_insumo_id" INTEGER NULL
          REFERENCES "insumos"("id_insumo")
    `);

    await queryRunner.query(`
      ALTER TABLE "pedidos" DROP COLUMN IF EXISTS "cuero_insumo_id"
    `);
  }
}
