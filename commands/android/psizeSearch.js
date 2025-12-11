const { DWebp } = require('cwebp');
const { parse } = require("node-html-parser");
const canvas = require('canvas');
const { Jimp } = require('jimp');
const fs = require('fs');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// this works probably
const imageCache = new Map();

// Global browser and page instance
let globalBrowser = null;
let globalPage = null;

async function getBrowser() {
  if (globalBrowser && globalBrowser.isConnected()) {
    return globalBrowser;
  }
  if (globalBrowser) {
    try { await globalBrowser.close(); } catch (e) { }
    globalBrowser = null;
  }

  const launchOptions = {
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ]
  };

  // i'm too lazy to solve puppeteer issues on linux so just use chromium
  if (process.platform === 'linux') {
    if (fs.existsSync('/usr/bin/chromium-browser')) {
      launchOptions.executablePath = '/usr/bin/chromium-browser';
    } else if (fs.existsSync('/usr/bin/chromium')) {
      launchOptions.executablePath = '/usr/bin/chromium';
    }
  }

  globalBrowser = await puppeteer.launch(launchOptions);
  return globalBrowser;
}

// Get or create a persistent page on the target domain
async function getSearchPage() {
  if (globalPage && !globalPage.isClosed() && globalPage.browser().isConnected()) {
    return globalPage;
  }

  // Clean up
  if (globalPage) {
    try { await globalPage.close(); } catch (e) { }
    globalPage = null;
  }

  try {
    const browser = await getBrowser();
    globalPage = await browser.newPage();

    // Block heavy resources to speed up initial load and keep it light
    await globalPage.setRequestInterception(true);
    globalPage.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navigate once to establish origin
    await globalPage.goto("https://www.phonearena.com/phones/size", { waitUntil: "domcontentloaded" });
    return globalPage;
  } catch (e) {
    console.error(`[Puppeteer] Setup failed: ${e}`);
    // If setup fails, kill page/browser to ensure clean state next retry
    if (globalPage) { try { await globalPage.close(); } catch (err) { } globalPage = null; }
    if (globalBrowser) { try { await globalBrowser.close(); } catch (err) { } globalBrowser = null; }
    throw e;
  }
}

async function WebPtoBuffer(buf) {
  try {
    let b = await fetch(buf).then(res => res.buffer());
    const decoder = new DWebp(b);
    return await decoder.toBuffer();
  } catch (e) {
    return buf;
  }
}

async function search(srch) {
  try {
    const page = await getSearchPage();

    const searchInputSelector = '.widgetCompareToolbar__form_search';
    const resultsSelector = '.widgetAutocomplete__list li a';

    // 2. Type new query using direct DOM manipulation to ensure listeners fire
    try {
      await page.waitForSelector(searchInputSelector);

      // Clear input and type new query
      await page.evaluate((selector, text) => {
        const input = document.querySelector(selector);
        input.focus();
        input.value = ''; // Direct clear
        input.dispatchEvent(new Event('input', { bubbles: true }));

        // Type new value
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      }, searchInputSelector, srch);

      // Small graceful wait for UI to react
      await new Promise(r => setTimeout(r, 500));

    } catch (e) {
      console.error("Search input error");
      throw e;
    }

    // 3. Wait for results that match the search term (Token-based)
    let phones = [];
    try {
      await page.waitForFunction((selector, searchTerm) => {
        const links = document.querySelectorAll(selector);
        if (links.length === 0) return false;

        const texts = Array.from(links).map(l => l.textContent.toLowerCase());
        const tokens = searchTerm.toLowerCase().split(' ').filter(t => t.trim() !== '');

        return texts.some(text => {
          return tokens.every(token => text.includes(token));
        });
      }, { timeout: 10000 }, resultsSelector, srch);
    } catch (e) {
      console.error(`Wait for relevant results timeout for search: "${srch}"`);

      // DEBUG: Log what was actually found to help diagnose
      try {
        const currentList = await page.evaluate((selector) => {
          return Array.from(document.querySelectorAll(selector)).map(l => l.innerText);
        }, resultsSelector);
        console.log("DEBUG: Current list contents at timeout:", currentList);
      } catch (err) {
        console.log("DEBUG: Could not scrape list at timeout");
      }
    }

    // 4. Scrape
    phones = await page.evaluate((selector) => {
      const links = document.querySelectorAll(selector);
      return Array.from(links).map(link => {
        const id = link.getAttribute('data-id');
        const clone = link.cloneNode(true);
        const btn = clone.querySelector('.widgetAutocomplete__list_item_button');
        if (btn) btn.remove();

        const name = clone.textContent.trim().replace(/-/g, ' ');
        const href = link.getAttribute('href');
        const match = href.match(/size\/([^\/]+)\/phones/);
        const label = match ? match[1] : name.replace(/ /g, '-');

        if (!id) return null;

        return {
          id: id,
          name: name,
          label: label,
          value: id
        };
      }).filter(p => p !== null);
    }, resultsSelector);

    if (!phones || phones.length === 0) return false;

    // Optional: could filter `phones` here to only include those matching `srch` if required
    // but the wait above ensures we have at least one valid one.

    return phones.map(phone => ({
      value: `${phone.value}\0${phone.name}`,
      label: phone.label
    }));

  } catch (e) {
    console.error(`Search error: ${e}`);
    // Reset page on fatal error
    if (globalPage) { try { await globalPage.close(); } catch (err) { } globalPage = null; }
    return false;
  }
}

async function generateSizeComparison(interaction) {
  const ids = new Map();
  for (const phone of interaction.values) ids.set(phone.value, phone);
  interaction.values = [...ids.values()];

  // Ensure link is properly encoded
  const rawLink = `https://www.phonearena.com/phones/size/${interaction.values.map(d => d.label).join(",")}/phones/${interaction.values.length == 1 ? "s/" : ""}${interaction.values.map(d => d.value).join(",")}`;
  const link = encodeURI(rawLink).replace(/\(/g, '%28').replace(/\)/g, '%29');

  let htmlContent = "";
  try {
    const page = await getSearchPage();
    // Fetch HTML content from the browser context
    htmlContent = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return await res.text();
    }, link);
  } catch (e) {
    console.error(`Comparison fetch error: ${e}`);
    if (globalPage) { try { await globalPage.close(); } catch (err) { } globalPage = null; }
    throw e;
  }

  let pageHtml = parse(htmlContent);

  let psize = pageHtml.querySelector(".widgetSizeCompare__compare_standardView").childNodes.filter(n => n.nodeType !== 3);


  pageHtml.querySelector(".widgetSizeCompare__compare_labels").childNodes.filter(n => n.nodeType !== 3).map((phone, i) => {
    interaction.values[i].dim = phone.querySelector(".widgetSizeCompare__compare_labels_label_specs_dimensions").childNodes[0].rawText.trim();
    interaction.values[i].weight = phone.querySelector(".widgetSizeCompare__compare_labels_label_specs_weight").childNodes[0].rawText.trim();
  });

  // possibly works, if not don't blame me
  for (let phone of psize) {
    let id = phone.rawAttrs.split('data-id="')[1].split('"')[0];

    // If cached, reuse
    if (imageCache.has(id)) {
      let cached = imageCache.get(id);
      let targetPhone = interaction.values.find(d => d.value == id);
      targetPhone.height = cached.height;
      targetPhone.front = cached.front;
      targetPhone.side = cached.side;
      continue;
    }

    let height, front, side, frontw, sidew = false;

    if (phone.querySelector(".widgetSizeCompare__phoneTemplate_phone_image_middle") != null) {
      let imgs = phone.querySelector(".widgetSizeCompare__phoneTemplate_phone_image_middle").childNodes.filter(n => n.nodeType !== 3);
      height = parseFloat(imgs[0].rawAttrs.split('height="')[1].split('"')[0].split(";")[0]);

      try {
        front = phone.querySelector(".widgetSizeCompare__phoneTemplate_phone_image_middle_front").rawAttrs.split('src="')[1].split('"')[0].split(";")[0];
      } catch (e) {
        let size = imgs[1];
        height = parseFloat(size.rawAttrs.split('style="')[1].split("height:")[1].split('"')[0].split(";")[0].trim());
        frontw = parseFloat(size.rawAttrs.split('style="')[1].split("width:")[1].split('"')[0].split(";")[0].trim());
        let canvasFront = canvas.createCanvas(Math.trunc(frontw), Math.trunc(height));
        let ctx = canvasFront.getContext("2d");
        ctx.fillStyle = "#999999";
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#999999";
        let pourcent = (n, p) => (p * n) / 100;
        ctx.roundRect(pourcent(frontw, 35), pourcent(height, 3), pourcent(frontw, 30), pourcent(height, 2), 3);
        ctx.fill();
        ctx.fillRect(pourcent(frontw, 5), pourcent(height, 8), pourcent(frontw, 90), pourcent(height, 82));
        ctx.roundRect(pourcent(frontw, 40), pourcent(height, 93), pourcent(frontw, 20), pourcent(height, 4), 3);
        ctx.fill();
        ctx.roundRect(0, 0, frontw, height, 20);
        ctx.stroke();
        front = canvasFront.toBuffer();
      }

      try {
        side = phone.querySelector(".widgetSizeCompare__phoneTemplate_phone_image_middle_side").rawAttrs.split('src="')[1].split('"')[0].split(";")[0];
      } catch (e) {
        let size = imgs[1];
        height = parseFloat(size.rawAttrs.split('style="')[1].split("height:")[1].split('"')[0].split(";")[0].trim());
        sidew = parseFloat(size.rawAttrs.split('style="')[1].split("width:")[1].split('"')[0].split(";")[0].trim());
        let canvasSide = canvas.createCanvas(Math.trunc(sidew), Math.trunc(height));
        let ctx = canvasSide.getContext("2d");
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#999999";
        ctx.roundRect(0, 0, sidew, height, 20);
        ctx.stroke();
        side = canvasSide.toBuffer();
      }
    } else {
      let size = phone.querySelector(".widgetSizeCompare__phoneTemplate_phone_blank").childNodes.filter(n => n.nodeType !== 3);
      height = parseFloat(size[0].rawAttrs.split('style="')[1].split("height:")[1].split('"')[0].split(";")[0].trim());
      frontw = parseFloat(size[0].rawAttrs.split('style="')[1].split("width:")[1].split('"')[0].split(";")[0].trim());
      sidew = parseFloat(size[1].rawAttrs.split('style="')[1].split("width:")[1].split('"')[0].split(";")[0].trim());
      let canvasFront = canvas.createCanvas(Math.trunc(frontw), Math.trunc(height));
      let canvasSide = canvas.createCanvas(Math.trunc(sidew), Math.trunc(height));

      let ctx = canvasFront.getContext("2d");
      ctx.fillStyle = "#999999";
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#999999";
      let pourcent = (n, p) => (p * n) / 100;
      ctx.roundRect(pourcent(frontw, 35), pourcent(height, 3), pourcent(frontw, 30), pourcent(height, 2), 3);
      ctx.fill();
      ctx.fillRect(pourcent(frontw, 5), pourcent(height, 8), pourcent(frontw, 90), pourcent(height, 82));
      ctx.roundRect(pourcent(frontw, 40), pourcent(height, 93), pourcent(frontw, 20), pourcent(height, 4), 3);
      ctx.fill();
      ctx.roundRect(0, 0, frontw, height, 20);
      ctx.stroke();

      ctx = canvasSide.getContext("2d");
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#999999";
      ctx.roundRect(0, 0, sidew, height, 20);
      ctx.stroke();

      front = canvasFront.toBuffer();
      side = canvasSide.toBuffer();
    }

    let targetPhone = interaction.values.find(d => d.value == id);
    targetPhone.height = height;
    targetPhone.front = front;
    targetPhone.side = side;

    // Save in cache
    imageCache.set(id, { height, front, side });
  }

  // this code fucked my mom
  interaction.values.sort((a, b) => b.height - a.height);

  let colors = [
    { rgb: "rgba(107,170,232,1)", emoji: "🔵" },
    { rgb: "rgba(203,63,73,1)", emoji: "🔴" },
    { rgb: "rgba(132,175,99,1)", emoji: "🟢" },
    { rgb: "rgba(243,176,78,1)", emoji: "🟡" },
    { rgb: "rgba(165,143,209,1)", emoji: "🟣" },
    { rgb: "rgba(243,176,78,1)", emoji: "🟠" },
    { rgb: "rgba(181,109,85,1)", emoji: "🟤" }
  ];

  for (let [i, phone] of interaction.values.entries()) {
    let front = await Jimp.read(await WebPtoBuffer(phone.front));
    let side = await Jimp.read(await WebPtoBuffer(phone.side));
    let op = 0.5;
    if (interaction.values.length === 1) op = 1;

    const frontAspectRatio = front.bitmap.width / front.bitmap.height;
    const sideAspectRatio = side.bitmap.width / side.bitmap.height;

    const targetHeight = Math.trunc(phone.height);
    const frontTargetWidth = Math.trunc(targetHeight * frontAspectRatio);
    const sideTargetWidth = Math.trunc(targetHeight * sideAspectRatio);

    front.resize({ w: frontTargetWidth, h: targetHeight });
    front.opacity(op);
    side.resize({ w: sideTargetWidth, h: targetHeight });
    side.opacity(op);

    let f = new canvas.Image;
    let s = new canvas.Image;
    f.src = await front.getBuffer('image/png');
    s.src = await side.getBuffer('image/png');
    phone.front = f;
    phone.side = s;
    phone.frontw = f.width;
    phone.sidew = s.width;
    phone.color = colors[i];
  }

  for (let phone of interaction.values) {
    let front = canvas.createCanvas(Math.trunc(phone.front.width), Math.trunc(phone.front.height));
    let side = canvas.createCanvas(Math.trunc(phone.side.width), Math.trunc(phone.side.height));
    let cf = front.getContext("2d");
    let cs = side.getContext("2d");

    cf.drawImage(phone.front, 0, 0);
    cs.drawImage(phone.side, 0, 0);
    cf.strokeStyle = phone.color.rgb;
    cf.lineWidth = 4;
    cs.strokeStyle = phone.color.rgb;
    cs.lineWidth = 4;
    cf.strokeRect(0, 0, Math.trunc(phone.front.width), Math.trunc(phone.front.height));
    cs.strokeRect(0, 0, Math.trunc(phone.side.width), Math.trunc(phone.side.height));

    var imgf = new canvas.Image;
    imgf.src = front.toBuffer();
    var imgs = new canvas.Image;
    imgs.src = side.toBuffer();
    phone.front = imgf;
    phone.side = imgs;
  }

  const formattedValues = JSON.parse(JSON.stringify(interaction.values));

  let padding = 10;
  let w = formattedValues.sort((a, b) => b.frontw - a.frontw)[0].frontw + padding + formattedValues.sort((a, b) => b.sidew - a.sidew)[0].sidew;
  let h = formattedValues.sort((a, b) => b.height - a.height)[0].height;
  let image = canvas.createCanvas(w, h);
  let ctx = image.getContext("2d");

  let embedDescription = "";
  for (let phone of interaction.values) {
    ctx.drawImage(phone.front, 0, h - phone.height);
    ctx.drawImage(phone.side, formattedValues.sort((a, b) => b.frontw - a.frontw)[0].frontw + padding, h - phone.height);
    embedDescription += `**${phone.color.emoji}: ${phone.name}**\n${phone.dim} | ${phone.weight}\n`;
  }
  embedDescription += `[Link](${link})`;

  return {
    image: image.toBuffer(),
    description: embedDescription,
    link: link
  };
}

module.exports = {
  search,
  generateSizeComparison
};
