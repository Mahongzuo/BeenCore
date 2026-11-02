import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { palettes, type Palette } from '@been/core';
import { dictionaries, deviceLang, I18nContext, localeOf } from '@/i18n';
import { useSettings } from '@/lib/settings';

export { fonts, type, space } from '@been/core';

interface ThemeValue {
  c: Palette;
  dark: boolean;
}

const ThemeContext = createContext<ThemeValue>({ c: palettes.light, dark: false });

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

export function AppProviders({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const settings = useSettings();
  const dark = settings.appearance === 'system' ? system === 'dark' : settings.appearance === 'dark';
  const theme = useMemo(() => ({ c: dark ? palettes.dark : palettes.light, dark }), [dark]);

  const lang = settings.lang === 'auto' ? deviceLang() : settings.lang;
  const i18n = useMemo(() => ({ t: dictionaries[lang], lang, locale: localeOf(lang) }), [lang]);

  return (
    <ThemeContext.Provider value={theme}>
      <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>
    </ThemeContext.Provider>
  );
}
