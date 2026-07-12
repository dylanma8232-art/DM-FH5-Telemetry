const puppeteer = require('puppeteer');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.setCacheEnabled(false);
  
  page.on('console', msg => {
    console.log(`[BROWSER ${msg.type().toUpperCase()}]:`, msg.text());
  });
  
  page.on('pageerror', err => {
    console.log('[PAGE ERROR]:', err.toString());
  });

  console.log('Navigating to homepage with cache buster...');
  // Use query parameter to force reload of index.html
  await page.goto('http://127.0.0.1:9188/?t=' + Date.now());
  await wait(3000);
  
  console.log('Clicking on 比赛中心...');
  try {
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*'));
      const match = els.find(el => {
        return el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 && el.textContent.trim() === '比赛中心';
      });
      if (match) {
        match.click();
        console.log('Clicked 比赛中心!');
      } else {
        console.log('Could not find exact text match for 比赛中心');
      }
    });
    await wait(4000);
  } catch (e) {
    console.log('Error during nav/click:', e);
  }

  await browser.close();
  console.log('Browser closed.');
})();
