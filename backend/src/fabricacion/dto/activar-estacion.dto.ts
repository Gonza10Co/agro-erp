import { IsBoolean } from 'class-validator';

export class ActivarEstacionDto {
  @IsBoolean()
  activa!: boolean;
}
