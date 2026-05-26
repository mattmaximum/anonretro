/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/client/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base:            'var(--color-base)',
        surface:         'var(--color-surface)',
        raised:          'var(--color-raised)',
        border:          'var(--color-border)',
        'border-active': 'var(--color-border-active)',
        accent:          'var(--color-accent)',
        'accent-hover':  'var(--color-accent-hover)',
        'accent-muted':  'var(--color-accent-muted)',
        'text-1':        'var(--color-text-1)',
        'text-2':        'var(--color-text-2)',
        'text-3':        'var(--color-text-3)',
        success:         'var(--color-success)',
        warning:         'var(--color-warning)',
        danger:          'var(--color-danger)',
        'blur-fill':     'var(--color-blur-fill)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        full: '9999px',
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
