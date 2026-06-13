import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class DespacharDto {
  @IsInt()
  opId!: number;

  @IsOptional()
  @IsBoolean()
  autorizar?: boolean;

  @IsOptional()
  @IsString()
  motivo?: string;
}
