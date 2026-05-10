# urban-padel-newsletter-landing

Public landing page for the Polski Padel Weekly newsletter. Built with Astro + Tailwind, deployed to GitHub Pages at [urbanpadel.pl](https://urbanpadel.pl).

## Development

```bash
npm ci
echo "BUTTONDOWN_API_KEY=..." > .env
npm run dev
```

## Deploy

Pushes to `master` trigger `.github/workflows/deploy.yml`, which builds the site and publishes to the `gh-pages` branch. GitHub Pages serves that branch at the `urbanpadel.pl` custom domain (CNAME committed in `public/CNAME`).

Required repo secret: `BUTTONDOWN_API_KEY` (used at build time to fetch published issues from Buttondown).
