import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://urbanpadel.pl',
  output: 'static',
  integrations: [tailwind()],
});
