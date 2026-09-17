import { MigrationInterface, QueryRunner } from 'typeorm';

// "Ventas del día" del Reporte Diario filtraba por fecha_entrega — una fecha
// de planificación — como si fuera el momento en que el pedido se completó.
// Un pedido creado y terminado hoy, con entrega prometida para la semana que
// viene, no aparecía como venta de hoy. fecha_actualizacion tampoco sirve:
// se pisa con cualquier edición posterior del pedido.
//
// fecha_completado es timestamp (no date) porque el Reporte Diario usa una
// ventana de día en hora Bolivia (UTC-4), no el día del servidor.
//
// Backfill: auditoria ya registraba el evento ('MOVER'/'pedidos' con la
// descripción exacta que emite moverEstado), así que los Terminados
// existentes se rellenan con la fecha real del movimiento, no con una
// estimación derivada de fecha_entrega. Los pedidos terminados antes de que
// existiera ese registro de auditoría quedan en NULL a propósito: es más
// honesto que inventarles una fecha de completado, y "Ventas del día" solo
// mira el día en curso.
export class AddFechaCompletadoPedidos1789622233760 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pedidos" ADD COLUMN "fecha_completado" TIMESTAMP NULL
    `);

    await queryRunner.query(`
      UPDATE "pedidos" p
         SET "fecha_completado" = a.fecha
        FROM (
          SELECT
            'Movió pedido #' || pe.id_pedido || ' a estado Terminado' AS descripcion,
            MAX(au.fecha) AS fecha
          FROM "pedidos" pe
          JOIN "auditoria" au
            ON au.descripcion = 'Movió pedido #' || pe.id_pedido || ' a estado Terminado'
           AND au.accion = 'MOVER'
           AND au.modulo = 'pedidos'
          WHERE pe.estado = 'Terminado'
          GROUP BY pe.id_pedido
        ) a
       WHERE a.descripcion = 'Movió pedido #' || p.id_pedido || ' a estado Terminado'
         AND p.estado = 'Terminado'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pedidos" DROP COLUMN "fecha_completado"
    `);
  }
}
