import { Injectable } from '@nestjs/common';
import { messages, LocalizedMessages } from './messages';

@Injectable()
export class LocalizationService {
  private defaultLanguage = 'en';

  getMessages(language: string = this.defaultLanguage): LocalizedMessages {
    return messages[language] || messages[this.defaultLanguage];
  }

  getMessage(key: keyof LocalizedMessages, language: string = this.defaultLanguage): string {
    const messages = this.getMessages(language);
    return messages[key] || messages[key as keyof LocalizedMessages];
  }
} 