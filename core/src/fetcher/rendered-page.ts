import { chromium } from 'playwright';

export async function fetchRenderedPage(url: string, timeoutMs = 30000): Promise<{ html: string }> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
    const html = await page.content();
    return { html };
  } finally {
    await browser.close();
  }
}
