import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ActualizarGrupoOpcionDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) nombre?: string;
  @IsOptional() @IsBoolean() obligatorio?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() orden?: number;
}
