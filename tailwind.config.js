/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/client/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base:          '#0E0E16',
        surface:       '#181825',
        raised:        '#222233',
        border:        '#2C2C42',
        'border-active': '#5B5BD6',
        accent:        '#8B83F4',
        'accent-hover':'#7166E8',
        'accent-muted':'#2D2B52',
        'text-1':      '#ECEAF5',
        'text-2':      '#8886A4',
        'text-3':      '#524F6A',
        success:       '#4ADE80',
        warning:       '#FBBF24',
        danger:        '#F87171',
        'blur-fill':   '#1E1E2E',
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
