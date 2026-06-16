import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsNumber, Min, ValidateNested } from 'class-validator';

const TIPOS_META = ['GUARNICION', 'INYECCION', 'FACTURACION_PARES', 'FACTURACION_VALOR'] as const;

export class MetaItemDto {
  @IsIn(TIPOS_META) tipo!: (typeof TIPOS_META)[number];
  @Type(() => Number) @IsNumber() @Min(0) valor!: number;
}

export class GuardarMetasDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MetaItemDto)
  items!: MetaItemDto[];
}
