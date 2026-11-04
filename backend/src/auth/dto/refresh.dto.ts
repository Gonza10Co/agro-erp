import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  refreshToken!: string;
}
