// Report palette. Charts use only the blues, amber and white; ink is reserved for body text.
export const THEME = {
  blue: '#0090DA',
  navy: '#0061A0',
  light: '#CCE9F7',
  amber: '#F2A900',
  white: '#FFFFFF',
  ink: '#1F2A37',
  muted: '#5B6B7A',
  rule: '#D9E6EF',
  wash: '#F3F9FD',
};

/** Confidence label -> chart colour. Weak evidence is the one amber signal. */
export const LABEL_COLOURS = {
  'Strongly supported': THEME.navy,
  'Well supported': THEME.blue,
  'Partially supported': THEME.light,
  'Weakly supported': THEME.amber,
};

export const BRAND = { product: 'Vantage Point', parent: 'The Continuum Lab' };
