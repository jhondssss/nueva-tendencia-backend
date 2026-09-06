// src/user/user.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { User } from './entities/user.entity';
import { Cliente } from '../cliente/entities/cliente.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Cliente])],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
