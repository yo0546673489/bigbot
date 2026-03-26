import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class WhatsAppGroupMemberDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsNotEmpty()
  jid: string;

  @IsString()
  @IsNotEmpty()
  lid: string;

  @IsString()
  @IsOptional()
  admin?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  isAdmin?: boolean;

  @IsBoolean()
  @IsOptional()
  isSuperAdmin?: boolean;
}

export class CreateWhatsAppGroupDto {
  @IsString()
  @IsNotEmpty()
  groupId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WhatsAppGroupMemberDto)
  participants: WhatsAppGroupMemberDto[];
}

export class UpdateWhatsAppGroupDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WhatsAppGroupMemberDto)
  @IsOptional()
  participants?: WhatsAppGroupMemberDto[];
}
