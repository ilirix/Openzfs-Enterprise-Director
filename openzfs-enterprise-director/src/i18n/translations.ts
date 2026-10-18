import { Language } from '../types/zfs';
import { sq } from './locales/sq';
import { en } from './locales/en';
import { es } from './locales/es';
import { zh } from './locales/zh';
import { hi } from './locales/hi';
import { fr } from './locales/fr';
import { de } from './locales/de';
import { ar } from './locales/ar';

export interface LanguageMeta {
  code: Language;
  name: string;
  native: string;
  flag: string;
  dir?: 'ltr' | 'rtl';
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  { code: 'en', name: 'English', native: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸' },
  { code: 'zh', name: 'Chinese', native: '简体中文', flag: '🇨🇳' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', flag: '🇮🇳' },
  { code: 'fr', name: 'French', native: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', native: 'Deutsch', flag: '🇩🇪' },
  { code: 'ar', name: 'Arabic', native: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  { code: 'sq', name: 'Albanian', native: 'Shqip', flag: '🇦🇱' },
];

export const TRANSLATIONS: Record<Language, Record<string, string>> = {
  sq,
  en,
  es,
  zh,
  hi,
  fr,
  de,
  ar,
};
