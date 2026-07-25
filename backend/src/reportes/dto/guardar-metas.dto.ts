import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsNumber, Min, ValidateNested } from 'class-validator';
import { TIPOS_META } from '../reporte-diario-core';
// `import type` obligatorio: con isolatedModules + emitDecoratorMetadata, un tipo
// usado en una firma decorada no puede venir en un import de valor (TS1272).
import type { TipoMeta } from '../reporte-diario-core';

export class MetaItemDto {
  // La whitelist se deriva del core (5 células + 2 de facturación): duplicarla acá
  // era la forma segura de que un tipo nuevo pasara la validación pero no el reporte.
  @IsIn(TIPOS_META) tipo!: TipoMeta;
  @Type(() => Number) @IsNumber() @Min(0) valor!: number;
}

export class GuardarMetasDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MetaItemDto)
  items!: MetaItemDto[];
}
