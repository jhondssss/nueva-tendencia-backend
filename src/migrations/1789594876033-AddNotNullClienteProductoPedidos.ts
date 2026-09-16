import { MigrationInterface, QueryRunner } from 'typeorm';

// cliente_id/producto_id de pedidos quedaron nullable por descuido de la
// creación manual de la tabla (no hubo migración CreateTablePedidos). Las FK
// son ON DELETE NO ACTION (Cliente/ProductoService bloquean el borrado si
// hay pedidos asociados, ver fkViolationTable), no SET NULL, así que la
// nullability nunca fue intencional para preservar historial. Verificado
// antes de aplicar: los 130 pedidos reales en Supabase no tienen NULL en
// ninguna de las dos columnas, y ni CreatePedidoDto (obligatorios) ni el
// update de PedidoCrudService (chequeo truthy, nunca asigna null a la
// relación) tienen un camino que escriba NULL vía la API.
export class AddNotNullClienteProductoPedidos1789594876033 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pedidos"
        ALTER COLUMN "cliente_id" SET NOT NULL,
        ALTER COLUMN "producto_id" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pedidos"
        ALTER COLUMN "cliente_id" DROP NOT NULL,
        ALTER COLUMN "producto_id" DROP NOT NULL
    `);
  }
}
