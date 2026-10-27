import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateDocumentDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
