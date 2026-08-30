/**
 * Backfill de token_seguimiento para pedidos existentes que lo tengan NULL o vacío.
 *
 * Modo por defecto: DRY RUN (solo cuenta y lista, no escribe nada).
 * Para aplicar los cambios: ts-node -r tsconfig-paths/register scripts/backfill-token-seguimiento.ts --apply
 */
import 'reflect-metadata';
import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from '../data-source';
import { Pedido } from '../src/pedido/entities/pedido.entity';

async function main() {
  const apply = process.argv.includes('--apply');

  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(Pedido);

  const afectados = await repo
    .createQueryBuilder('p')
    .where('p.token_seguimiento IS NULL')
    .orWhere("p.token_seguimiento = ''")
    .orderBy('p.id_pedido', 'ASC')
    .getMany();

  console.log(`Pedidos afectados (token_seguimiento NULL o vacío): ${afectados.length}`);
  if (afectados.length > 0) {
    console.log('IDs:', afectados.map((p) => p.id_pedido).join(', '));
  }

  if (!apply) {
    console.log('\nDRY RUN — no se escribió nada. Ejecutar con --apply para aplicar el backfill.');
    await AppDataSource.destroy();
    return;
  }

  console.log('\nAplicando backfill...');
  let actualizados = 0;
  for (const pedido of afectados) {
    await AppDataSource
      .createQueryBuilder()
      .update(Pedido)
      .set({ token_seguimiento: uuidv4() })
      .where('id_pedido = :id', { id: pedido.id_pedido })
      .execute();
    actualizados++;
  }

  console.log(`Listo. ${actualizados} pedido(s) actualizados con nuevo token_seguimiento.`);
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error('Error en backfill:', err);
  process.exit(1);
});
