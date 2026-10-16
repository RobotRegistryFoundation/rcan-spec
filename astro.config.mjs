import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://rcan.dev',
  integrations: [
    sitemap({
      // Redirect stubs and the 404 page are not content.
      filter: (page) =>
        !/\/(registry|compliance|governance\/robot-registry-foundation|404)\/?$/.test(page),
    }),
    tailwind(),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },
});

