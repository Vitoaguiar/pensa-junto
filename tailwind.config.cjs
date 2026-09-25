/** @type {import('tailwindcss').Config} */
const v = (name) => `var(--${name})`

module.exports = {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    // Grid de 8px: a escala padrão do Tailwind (4px) é mantida, mas os componentes usam múltiplos de 2.
    extend: {
      screens: { wide: '1100px' },
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        'surface-2': v('surface-2'),
        border: v('border'),
        ink: v('ink'),
        'ink-muted': v('ink-muted'),
        primary: v('primary'),
        'primary-strong': v('primary-strong'),
        'primary-soft': v('primary-soft'),
        accent: v('accent'),
        'accent-soft': v('accent-soft'),
        'accent-ink': v('accent-ink'),
        hint: v('hint'),
        'hint-soft': v('hint-soft'),
        'hint-ink': v('hint-ink'),
        success: v('success'),
        'success-strong': v('success-strong'),
        'success-soft': v('success-soft'),
        retry: v('retry'),
        'retry-soft': v('retry-soft'),
        danger: v('danger'),
        lilac: v('lilac')
      },
      fontFamily: {
        sans: ['Lexend', 'system-ui', 'sans-serif']
      },
      fontSize: {
        support: ['16px', { lineHeight: '1.5' }],
        body: ['18px', { lineHeight: '1.55' }],
        button: ['20px', { lineHeight: '1.2', fontWeight: '600' }],
        statement: ['27px', { lineHeight: '1.5', fontWeight: '500' }],
        title: ['32px', { lineHeight: '1.25', fontWeight: '700' }],
        key: ['32px', { lineHeight: '1', fontWeight: '600' }]
      },
      borderRadius: {
        input: '12px',
        card: '20px',
        pill: '999px'
      },
      boxShadow: {
        soft: '0 4px 16px rgba(30,34,64,.08)'
      },
      transitionTimingFunction: {
        brand: 'cubic-bezier(.2,.8,.2,1)'
      },
      minHeight: { target: '56px', key: '64px' },
      minWidth: { target: '56px', key: '64px' }
    }
  },
  plugins: []
}
