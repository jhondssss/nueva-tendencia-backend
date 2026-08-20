import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCalificacionPedido1787267482568 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "calificacion_pedido" (
        "id_calificacion" SERIAL PRIMARY KEY,
        "pedido_id" integer NOT NULL,
        "puntuacion" integer NOT NULL,
        "comentario" text NULL,
        "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_calificacion_pedido_pedido_id" UNIQUE ("pedido_id"),
        CONSTRAINT "CHK_calificacion_pedido_puntuacion" CHECK ("puntuacion" BETWEEN 1 AND 5),
        CONSTRAINT "FK_calificacion_pedido_pedido_id" FOREIGN KEY ("pedido_id")
          REFERENCES "pedidos" ("id_pedido") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "calificacion_pedido"`);
  }
}
