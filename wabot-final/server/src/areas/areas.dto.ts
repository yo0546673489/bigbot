import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSupportAreaDto {
  @IsString()
  @MinLength(1)
  name: string;
}

export class UpdateSupportAreaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}

export class CreateAreaShortcutDto {
  @IsString()
  @MinLength(1)
  shortName: string;

  @IsString()
  @MinLength(1)
  fullName: string;
}

export class UpdateAreaShortcutDto {
  @IsOptional()
  @IsString()
  shortName?: string;

  @IsOptional()
  @IsString()
  fullName?: string;
}

export class CreateRelatedAreaDto {
  @IsString()
  @MinLength(1)
  main: string;

  @IsArray()
  @IsString({ each: true })
  related: string[];
}

export class UpdateRelatedAreaDto {
  @IsOptional()
  @IsString()
  main?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  related?: string[];
}

export class CreateNonStreetKeywordDto {
  @IsString()
  @MinLength(1)
  word: string;

  @IsOptional()
  @IsString()
  notes?: string;
}