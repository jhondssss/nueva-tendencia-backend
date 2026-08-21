import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSolicitudPedido1787277585987 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "solicitud_pedido" (
        "id_solicitud" SERIAL PRIMARY KEY,
        "cliente_id" integer NOT NULL,
        "producto_id" integer NOT NULL,
        "categoria" varchar NOT NULL,
        "cantidad_pares" integer NOT NULL,
        "tallas" jsonb NOT NULL,
        "comentario_cliente" text NULL,
        "fecha_entrega_deseada" date NULL,
        "estado" varchar NOT NULL DEFAULT 'Pendiente',
        "motivo_rechazo" text NULL,
        "pedido_id_creado" integer NULL,
        "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_solicitud_pedido_categoria" CHECK ("categoria" IN ('nino', 'juvenil', 'adulto')),
        CONSTRAINT "CHK_solicitud_pedido_estado" CHECK ("estado" IN ('Pendiente', 'Aprobada', 'Rechazada')),
        CONSTRAINT "FK_solicitud_pedido_cliente_id" FOREIGN KEY ("cliente_id")
          REFERENCES "cliente" ("id_cliente") ON DELETE CASCADE,
        CONSTRAINT "FK_solicitud_pedido_producto_id" FOREIGN KEY ("producto_id")
          REFERENCES "productos" ("id_producto") ON DELETE CASCADE,
        CONSTRAINT "FK_solicitud_pedido_pedido_id_creado" FOREIGN KEY ("pedido_id_creado")
          REFERENCES "pedidos" ("id_pedido") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_solicitud_pedido_cliente_id" ON "solicitud_pedido" ("cliente_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_solicitud_pedido_estado" ON "solicitud_pedido" ("estado")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "solicitud_pedido"`);
  }
}
