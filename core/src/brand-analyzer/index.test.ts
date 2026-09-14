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

const fixture3DigitHexHtml = `
<html>
<head>
  <title>Brand Co</title>
  <meta property="og:site_name" content="Brand Co" />
  <style>
    .hero { background: #0bf; }
    .cta { color: #0bf; }
    .accent { background: #0bf; }
  </style>
</head>
<body>
  <header><img src="../assets/brand-logo.svg" alt="Brand Co logo" /></header>
  <main><h1>Welcome</h1></main>
</body>
</html>`;

const fixtureMultipleImgsHtml = `
<html>
<head>
  <title>Shop Co</title>
  <meta property="og:site_name" content="Shop Co" />
</head>
<body>
  <footer>
    <img src="/payment-logos.png" alt="payment options" />
  </footer>
  <header>
    <img src="../assets/shop-logo.svg" alt="Shop Co logo" />
  </header>
  <main><h1>Welcome</h1></main>
</body>
</html>`;

describe('analyzeBrand', () => {
  it('detects the logo image (as the raw, already-localized src), dominant color, and brand name', () => {
    const profile = analyzeBrand([{ url: 'https://acme.example', html: fixtureHtml }]);
    expect(profile.logoSrc).toBe('../assets/a1b2c3.svg');
    expect(profile.dominantColors[0]).toBe('#1b7964');
    expect(profile.brandName).toBe('Acme Rockets');
  });

  it('normalizes 3-digit hex shorthand colors to 6-digit form', () => {
    const profile = analyzeBrand([{ url: 'https://brand.example', html: fixture3DigitHexHtml }]);
    // #0bf should be normalized to #00bbff and be the dominant color
    expect(profile.dominantColors[0]).toBe('#00bbff');
    expect(profile.brandName).toBe('Brand Co');
  });

  it('detects logo by selector priority even when non-logo images appear first in DOM', () => {
    const profile = analyzeBrand([{ url: 'https://shop.example', html: fixtureMultipleImgsHtml }]);
    // Payment logo appears first in DOM but should be skipped due to selector priority
    // Real logo with alt="Shop Co logo" should be detected despite appearing later
    expect(profile.logoSrc).toBe('../assets/shop-logo.svg');
    expect(profile.brandName).toBe('Shop Co');
  });
});
