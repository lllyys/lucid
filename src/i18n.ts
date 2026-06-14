// Purpose: i18n scaffold (rule 66 §5). lucid's own UI is localizable — all
// user-facing strings go through t(). Keys are flat, dot-separated camelCase
// (e.g. error.rateLimited), so keySeparator/nsSeparator are disabled and the
// whole string is one flat key. New strings are added to src/locales/en/*.json.

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/locales/en/translation.json'

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  keySeparator: false, // flat dot keys, not nested lookups
  nsSeparator: false, // single namespace
  interpolation: { escapeValue: false }, // React already escapes
})

export default i18n
