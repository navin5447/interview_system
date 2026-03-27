/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f5f3ff',
          100: '#ebe4ff',
          200: '#d2c4ff',
          300: '#b59eff',
          400: '#a88bff',
          500: '#8c6bff',
          600: '#7353f6',
          700: '#5b3fd1',
          800: '#4330a3',
          900: '#2d2170',
        },
        skyAccent: '#5cc9f5',
        graphite: '#231f20',
        surface: '#ffffff',
        surfaceMuted: '#f5f5f8',
        borderSubtle: 'rgba(0,0,0,0.06)'
      }
    },
  },
  plugins: [],
}
