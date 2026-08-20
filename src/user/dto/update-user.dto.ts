import { IsIn, IsOptional, IsString } from 'class-validator';
import { Role } from '../../auth/enums/role.enum';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  apellido?: string;

  @IsOptional()
  @IsIn([Role.ADMIN, Role.OPERARIO, Role.USER], { message: 'Rol inválido' })
  role?: string;
}
