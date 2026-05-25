import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropTablePedido1779667200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pedido"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No se recrea: la tabla "pedido" (singular) es un artefacto obsoleto;
    // la tabla activa es "pedidos" (plural) gestionada por Pedido.entity.
  }
}
