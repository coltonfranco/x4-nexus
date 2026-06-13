
import { test, expect } from '@playwright/test';

test('capture logs', async ({ page }) => {
  const logs = [];
  page.on('console', msg => logs.push(msg.text()));
  
  await page.goto('http://127.0.0.1:8765/');
  await page.waitForTimeout(2000);
  
  await page.click('text=Conflict');
  await page.waitForTimeout(2000);
  
  console.log('--- CAPTURED LOGS ---');
  logs.forEach(l => {
      if (l.includes('GATE 115')) {
          console.log(l);
      }
  });
});
