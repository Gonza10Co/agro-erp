import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetearPasswordDto {
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
}
