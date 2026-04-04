export { default as fr } from './fr'
export { default as en } from './en'
export type { Translations } from './fr'

export type Locale = 'fr' | 'en'

export const locales: Locale[] = ['fr', 'en']

export const localeNames: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
}
