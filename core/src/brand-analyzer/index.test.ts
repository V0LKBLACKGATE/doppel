import { describe, it, expect } from 'vitest';
import { analyzeBrand } from './index.js';

const fixtureHtml = `
<html>
<head>
  <title>Acme Rockets</title>
  <meta property="og:site_name" content="Acme Rockets" />
  <style>
    .hero { background: #1B7964; }
    .cta { color: #1B7964; }
    .footer { background: #1B7964; }
  </style>
</head>
<body>
  <header><img src="../assets/a1b2c3.svg" alt="Acme Rockets logo" class="logo" /></header>
  <main><h1 style="color:#31C99D">Welcome to Acme Rockets</h1></main>
  <footer>&copy; 2026 Acme Rockets</footer>
</body>
</html>`;

describe('analyzeBrand', () => {
  it('detects the logo image (as the raw, already-localized src), dominant color, and brand name', () => {
    const profile = analyzeBrand([{ url: 'https://acme.example', html: fixtureHtml }]);
    expect(profile.logoSrc).toBe('../assets/a1b2c3.svg');
    expect(profile.dominantColors[0]).toBe('#1b7964');
    expect(profile.brandName).toBe('Acme Rockets');
  });
});
