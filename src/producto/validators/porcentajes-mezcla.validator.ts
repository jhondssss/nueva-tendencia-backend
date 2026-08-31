import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Exige que porcentaje_clefa y porcentaje_pasta vengan ambos o ninguno,
// y que si vienen ambos, sumen exactamente 100.
@ValidatorConstraint({ name: 'PorcentajesMezclaValidos', async: false })
export class PorcentajesMezclaValidosConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as { porcentaje_clefa?: number; porcentaje_pasta?: number };
    const { porcentaje_clefa, porcentaje_pasta } = obj;

    const clefaProvisto = porcentaje_clefa !== undefined && porcentaje_clefa !== null;
    const pastaProvisto = porcentaje_pasta !== undefined && porcentaje_pasta !== null;

    if (!clefaProvisto && !pastaProvisto) return true;
    if (clefaProvisto !== pastaProvisto) return false;

    return Math.round((porcentaje_clefa! + porcentaje_pasta!) * 100) / 100 === 100;
  }

  defaultMessage(): string {
    return 'porcentaje_clefa y porcentaje_pasta deben venir ambos (o ninguno) y sumar exactamente 100';
  }
}

export function PorcentajesMezclaValidos(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: PorcentajesMezclaValidosConstraint,
    });
  };
}
