import type { Config } from 'tailwindcss';

// Minimal palette: zinc neutrals + a single emerald accent for "on track" states.
// Dark mode follows the OS — no toggle to keep the surface area small.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      letterSpacing: {
        tightish: '-0.01em',
      },
    },
  },
  plugins: [],
};

export default config;
