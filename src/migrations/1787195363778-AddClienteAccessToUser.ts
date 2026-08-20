import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClienteAccessToUser1787195363778 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user"
      ADD COLUMN "cliente_id" integer NULL,
      ADD COLUMN "requiere_cambio_password" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "user"
      ADD CONSTRAINT "UQ_user_cliente_id" UNIQUE ("cliente_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "user"
      ADD CONSTRAINT "FK_user_cliente_id" FOREIGN KEY ("cliente_id")
      REFERENCES "cliente" ("id_cliente") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "FK_user_cliente_id"`);
    await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "UQ_user_cliente_id"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "requiere_cambio_password"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "cliente_id"`);
  }
}
