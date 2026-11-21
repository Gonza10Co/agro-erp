import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import { AutorizacionDto } from '../../calidad/dto/autorizacion.dto';

export class AvanzarDto {
  @IsInt()
  @Min(1)
  operarioId!: number;

  /** Opcional desde el piloto: en Bodega o Producto terminado no hay máquina. */
  @IsOptional()
  @IsInt()
  @Min(1)
  maquinaId?: number;

  /**
   * Estación desde la que se hace el pistolazo (el dispositivo está amarrado a
   * una). Si viene, el backend valida que sea la que le toca al par y rechaza
   * el escaneo si se saltó una. Sin ella, avanza a la siguiente activa.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  estacion?: string;

  /**
   * "Algo pasó con este par": el pistolazo lleva el daño tipificado y la clase
   * del tipo decide el destino (baja + reposición, segunda, o reproceso). Va en
   * el mismo escaneo porque en PT el par se termina en la misma transacción y
   * un reporte aparte llegaría tarde: el par ya estaría en bodega como primera.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  tipoDanoId?: number;

  /** Nota del operario; obligatoria solo en una BAJA (es el acta). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  /**
   * Quién autoriza, si la sesión del dispositivo no puede sola: una SEGUNDA la
   * firma calidad (CALIDAD/GERENTE/ADMIN) y una BAJA el gerente (GERENTE/ADMIN).
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => AutorizacionDto)
  autorizacion?: AutorizacionDto;

  /**
   * Modo sin internet: hora REAL del pistolazo en la tablet (ISO 8601). Si viene,
   * el evento queda con esa hora y no con la de llegada. Se rechaza si está más
   * de 5 minutos en el futuro o tiene más de 7 días.
   */
  @IsOptional()
  @IsISO8601({ strict: true })
  // Con zona explícita: una hora "suelta" se leería en la zona del servidor.
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, { message: 'scannedAt debe traer zona horaria (Z o ±hh:mm)' })
  scannedAt?: string;

  /**
   * Modo sin internet: id único que la tablet le pone a cada pistolazo. Si el
   * mismo id llega dos veces (la cola reintenta), se responde lo ya registrado
   * sin duplicar el evento.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  clientScanId?: string;
}
