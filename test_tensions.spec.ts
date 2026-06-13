
import { test, expect } from '@playwright/test';

test('tensions show up', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/map');
  
  // Wait for map to load
  await page.waitForSelector('svg');

  // Open right hand menu, click Conflict
  await page.click('text=Conflict');

  // Find the gate for Brennan vs Gaian
  // We can just dump all SVG line strokes to console
  const lines = await page.eval('line', lines => lines.map(l => l.getAttribute('stroke') || l.style.stroke));
  console.log('Lines with red stroke:', lines.filter(s => s.includes('239') || s.includes('red')));
});
