/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Cold modern color palette
        claude: {
          // Light mode — static RGB for opacity modifier support
          bg: 'rgb(248 249 251 / <alpha-value>)',
          surface: 'rgb(255 255 255 / <alpha-value>)',
          surfaceHover: 'rgb(240 241 244 / <alpha-value>)',
          surfaceMuted: 'rgb(243 244 246 / <alpha-value>)',
          surfaceInset: 'rgb(235 237 240 / <alpha-value>)',
          border: 'rgb(224 226 231 / <alpha-value>)',
          borderLight: 'rgb(235 237 240 / <alpha-value>)',
          text: 'rgb(26 29 35 / <alpha-value>)',
          textSecondary: 'rgb(107 114 128 / <alpha-value>)',
          // Dark mode — CSS var (RGB channels) with Classic fallback; Tahoe overrides via .tahoe.dark
          darkBg: 'rgb(var(--claude-darkBg-rgb, 15 17 23) / <alpha-value>)',
          darkSurface: 'rgb(var(--claude-darkSurface-rgb, 26 29 39) / <alpha-value>)',
          darkSurfaceHover: 'rgb(var(--claude-darkSurfaceHover-rgb, 36 40 48) / <alpha-value>)',
          darkSurfaceMuted: 'rgb(var(--claude-darkSurfaceMuted-rgb, 21 24 32) / <alpha-value>)',
          darkSurfaceInset: 'rgb(var(--claude-darkSurfaceInset-rgb, 12 14 20) / <alpha-value>)',
          darkBorder: 'rgb(var(--claude-darkBorder-rgb, 42 46 56) / <alpha-value>)',
          darkBorderLight: 'rgb(var(--claude-darkBorderLight-rgb, 31 35 43) / <alpha-value>)',
          darkText: 'rgb(var(--claude-darkText-rgb, 228 229 233) / <alpha-value>)',
          darkTextSecondary: 'rgb(var(--claude-darkTextSecondary-rgb, 139 143 163) / <alpha-value>)',
          // Accent — CSS var (RGB channels) for Tahoe overridability
          accent: 'rgb(var(--claude-accent-rgb, 59 130 246) / <alpha-value>)',
          accentHover: 'rgb(var(--claude-accentHover-rgb, 37 99 235) / <alpha-value>)',
          accentLight: 'rgb(var(--claude-accentLight-rgb, 96 165 250) / <alpha-value>)',
          // accentMuted has built-in alpha — not used with /opacity modifiers
          accentMuted: 'var(--claude-accentMuted, rgba(59,130,246,0.10))',
        },
        primary: {
          DEFAULT: '#3B82F6',
          dark: '#2563EB'
        },
        secondary: {
          DEFAULT: '#6B7280',
          dark: '#2A2E38'
        }
      },
      boxShadow: {
        subtle: '0 1px 2px rgba(0,0,0,0.05)',
        card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        elevated: '0 4px 12px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.04)',
        modal: '0 8px 30px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)',
        popover: '0 4px 20px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.05)',
        'glow-accent': '0 0 20px rgba(59,130,246,0.15)',
        'glass-modal': '0 24px 60px rgba(0,0,0,0.5)',
        'glass-glow': '0 0 20px rgba(59,130,246,0.25)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-down': {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        // Tahoe animation keyframes
        'modal-enter': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'modal-exit': {
          '0%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.95)' },
        },
        'toast-slide-in': {
          '0%': { opacity: '0', transform: 'translateX(-50%) translateY(-100%)' },
          '100%': { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
        },
        'toast-slide-out': {
          '0%': { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
          '100%': { opacity: '0', transform: 'translateX(-50%) translateY(-100%)' },
        },
        'list-stagger': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'tab-switch': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'popover-enter': {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-in-up': 'fade-in-up 0.25s ease-out',
        'fade-in-down': 'fade-in-down 0.2s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        shimmer: 'shimmer 1.5s infinite',
        'toast-slide-in': 'toast-slide-in 300ms cubic-bezier(0.22, 1, 0.36, 1)',
        'toast-slide-out': 'toast-slide-out 200ms cubic-bezier(0.4, 0, 1, 1)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
        'ease-spring': 'cubic-bezier(0.22, 1, 0.36, 1)',
        'ease-exit': 'cubic-bezier(0.4, 0, 1, 1)',
      },
      typography: {
        DEFAULT: {
          css: {
            color: '#1A1D23',
            a: {
              color: '#3B82F6',
              '&:hover': {
                color: '#2563EB',
              },
            },
            code: {
              color: '#1A1D23',
              backgroundColor: 'rgba(224, 226, 231, 0.5)',
              padding: '0.2em 0.4em',
              borderRadius: '0.25rem',
              fontWeight: '400',
            },
            'code::before': {
              content: '""',
            },
            'code::after': {
              content: '""',
            },
            pre: {
              backgroundColor: '#F0F1F4',
              color: '#1A1D23',
              padding: '1em',
              borderRadius: '0.75rem',
              overflowX: 'auto',
            },
            blockquote: {
              borderLeftColor: '#3B82F6',
              color: '#6B7280',
            },
            h1: {
              color: '#1A1D23',
            },
            h2: {
              color: '#1A1D23',
            },
            h3: {
              color: '#1A1D23',
            },
            h4: {
              color: '#1A1D23',
            },
            strong: {
              color: '#1A1D23',
            },
          },
        },
        dark: {
          css: {
            color: '#E4E5E9',
            a: {
              color: '#60A5FA',
              '&:hover': {
                color: '#93BBFD',
              },
            },
            code: {
              color: '#E4E5E9',
              backgroundColor: 'rgba(42, 46, 56, 0.5)',
              padding: '0.2em 0.4em',
              borderRadius: '0.25rem',
              fontWeight: '400',
            },
            pre: {
              backgroundColor: '#1A1D27',
              color: '#E4E5E9',
              padding: '1em',
              borderRadius: '0.75rem',
              overflowX: 'auto',
            },
            blockquote: {
              borderLeftColor: '#3B82F6',
              color: '#8B8FA3',
            },
            h1: {
              color: '#E4E5E9',
            },
            h2: {
              color: '#E4E5E9',
            },
            h3: {
              color: '#E4E5E9',
            },
            h4: {
              color: '#E4E5E9',
            },
            strong: {
              color: '#E4E5E9',
            },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
