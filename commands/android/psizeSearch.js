const { DWebp } = require('cwebp');
const { parse } = require("node-html-parser");
const canvas = require('canvas');
const { Jimp } = require('jimp');

// this works probably
const imageCache = new Map();

const clientHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36 Edg/89.0.774.57",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9"
};

const serverHeaders = {
  "Content-Type": "application/x-www-form-urlencoded",
  "X-Requested-With": "XMLHttpRequest",
  "Referer": "https://www.phonearena.com/phones/size"
};

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
    let phones = await fetch(`https://www.phonearena.com/phones/size`, {
      method: "POST",
      body: `phone_name=${srch}&items=[]`,
      headers: serverHeaders
    }).then(res => res.json());

    if (phones.length === 0) return false;

    if (phones.length === 10) {
      let items = {};
      for (let phone of phones.slice(-3)) {
        items[phone.value] = phone.label;
      }

      try {
        let nphones = await fetch(`https://www.phonearena.com/phones/size`, {
          method: "POST",
          body: `phone_name=${srch}&items=${JSON.stringify(items)}`,
          headers: serverHeaders
        }).then(res => res.json());

        for (let phone of nphones) {
          if (phones.find(p => p.value === phone.value)) continue;
          phones.push(phone);
        }
      } catch (e) { }
    }

    return phones.map(phone => ({
      value: `${phone.value.toString()}\0${phone.readableName}`,
      label: phone.label
    }));
  } catch (e) {
    return false;
  }
}

canvas.CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius) {
  if (width < 2 * radius) radius = width / 2;
  if (height < 2 * radius) radius = height / 2;
  this.beginPath();
  this.moveTo(x + radius, y);
  this.arcTo(x + width, y, x + width, y + height, radius);
  this.arcTo(x + width, y + height, x, y + height, radius);
  this.arcTo(x, y + height, x, y, radius);
  this.arcTo(x, y, x + width, y, radius);
  this.closePath();
  return this;
};

async function generateSizeComparison(interaction) {
  const ids = new Map();
  for (const phone of interaction.values) ids.set(phone.value, phone);
  interaction.values = [...ids.values()];

  const link = `https://www.phonearena.com/phones/size/${interaction.values.map(d => d.label).join(",")}/phones/${interaction.values.length == 1 ? "s/" : ""}${interaction.values.map(d => d.value).join(",")}`;
  let pageHtml = parse(await fetch(link, { headers: clientHeaders }).then(res => res.text()));
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
      console.log(`[CACHE] Using cached images for phone ${id}`);
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
