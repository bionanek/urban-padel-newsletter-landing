/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,vue,svelte}'],
  theme: {
    extend: {
      colors: {
        bg:       '#0d0d0d',
        'bg-2':   '#151515',
        'bg-3':   '#1e1e1e',
        concrete: '#2a2a2a',
        fog:      '#8a8a88',
        chalk:    '#e8e6df',
        white:    '#f6f4ec',
        acid:     '#d4ff3a',
        magenta:  '#ff2e6a',
        cyan:     '#4adbff',
        rust:     '#ff6b35',
      },
      fontFamily: {
        archivo:  ['"Archivo Black"', 'sans-serif'],
        plex:     ['"IBM Plex Sans"', 'sans-serif'],
        vt323:    ['"VT323"', 'monospace'],
      },
      maxWidth: {
        wrapper: '980px',
      },
    },
  },
  plugins: [],
};
