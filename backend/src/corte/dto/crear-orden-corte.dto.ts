import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class LineaOrdenCorteDto {
  @IsInt() @Min(1) productoConfiguradoId!: number;
  @IsInt() @Min(1) tallaId!: number;
  @IsInt() @Min(1) cantProgramada!: number;
  /** OF que alimenta este renglón. Se omite cuando se corta contra stock. */
  @IsOptional() @IsInt() @Min(1) ofId?: number;
}

export class CrearOrdenCorteDto {
  /** El número que va escrito en la canasta: "AGR-861". */
  @IsString() @MaxLength(30) codigo!: string;
  @IsDateString() fecha!: string;
  @IsInt() @Min(1) lineaId!: number;
  @IsOptional() @IsInt() @Min(1) marcaId?: number;
  @IsOptional() @IsString() @MaxLength(500) observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaOrdenCorteDto)
  lineas!: LineaOrdenCorteDto[];
}
