import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const HISTORY_ROLES = ['user', 'assistant'] as const;

export class HistoryMessageDto {
  @IsIn(HISTORY_ROLES)
  role: (typeof HISTORY_ROLES)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}
