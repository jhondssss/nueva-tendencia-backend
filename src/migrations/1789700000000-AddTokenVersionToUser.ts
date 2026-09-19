import { MigrationInterface, QueryRunner } from 'typeorm';

// Invalidación real de sesiones: el JWT lleva token_version y RolesGuard lo
// compara contra esta columna en cada request. Al cambiar/resetear la
// contraseña se incrementa, con lo que cualquier token emitido antes deja de
// servir. DEFAULT 0 hace que los JWT ya emitidos (sin el claim) sigan
// valiendo hasta el primer cambio de contraseña.
export class AddTokenVersionToUser1789700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user" ADD COLUMN "token_version" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "token_version"`);
  }
}
