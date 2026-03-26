import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateDriverDto {
  @IsOptional()
  @IsBoolean()
  isApproved?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  ignorePayment?: boolean;
} 