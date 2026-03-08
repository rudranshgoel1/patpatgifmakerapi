import sharp from "sharp";
import GIFEncoder from "gif-encoder-2";
import fetch from "node-fetch";
import crypto from "crypto";

// constants

const MAX_FRAME = 4;
const OUT_SIZE = 112;
const CACHE_SIZE = 256;

const DEFAULTS = {
  squish: 1.25,
  scale: 0.875,
  delay: 60,
  spriteX: 14,
  spriteY: 20,
  flip: false,
};

const FRAME_OFFSETS = [
  { x: 0, y: 0, w: 0, h: 0 },
  { x: -4, y: 12, w: 4, h: -12 },
  { x: -12, y: 18, w: 12, h: -18 },
  { x: -8, y: 12, w: 4, h: -12 },
  { x: -4, y: 0, w: 0, h: 0 },
];

// frame math

function getSpriteFrame(frame, g) {
  const o = FRAME_OFFSETS[frame];
  return {
    dx: ~~(g.spriteX + o.x * (g.squish * 0.4)),
    dy: ~~(g.spriteY + o.y * (g.squish * 0.9)),
    dw: ~~((g.spriteWidth + o.w * g.squish) * g.scale),
    dh: ~~((g.spriteHeight + o.h * g.squish) * g.scale),
  };
}

// hand drawing

function drawHand(frame, width, height) {
  const buf = Buffer.alloc(width * height * 4, 0);
  const handYOffsets = [0, 4, 9, 4, 0];
  const hy = handYOffsets[frame];

  const R = 255,
    G = 220,
    B = 150,
    A = 255;
  const OR = 120,
    OG = 80,
    OB = 40,
    OA = 200;

  function setPixel(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  }

  function fillRect(x1, y1, x2, y2, r, g, b, a) {
    for (let y = y1; y <= y2; y++)
      for (let x = x1; x <= x2; x++) setPixel(x, y, r, g, b, a);
  }

  function roundedRect(x1, y1, x2, y2, radius) {
    fillRect(x1 + radius, y1, x2 - radius, y2, R, G, B, A);
    fillRect(x1, y1 + radius, x2, y2 - radius, R, G, B, A);
    for (let cy = 0; cy <= radius; cy++)
      for (let cx = 0; cx <= radius; cx++)
        if (cx * cx + cy * cy <= radius * radius) {
          setPixel(x1 + radius - cx, y1 + radius - cy, R, G, B, A);
          setPixel(x2 - radius + cx, y1 + radius - cy, R, G, B, A);
          setPixel(x1 + radius - cx, y2 - radius + cy, R, G, B, A);
          setPixel(x2 - radius + cx, y2 - radius + cy, R, G, B, A);
        }
    for (let x = x1; x <= x2; x++) {
      setPixel(x, y1, OR, OG, OB, OA);
      setPixel(x, y2, OR, OG, OB, OA);
    }
    for (let y = y1; y <= y2; y++) {
      setPixel(x1, y, OR, OG, OB, OA);
      setPixel(x2, y, OR, OG, OB, OA);
    }
  }

  const palmTop = 10 + hy;
  const palmLeft = 20;
  const palmRight = 88;
  const palmBot = 70 + hy;
  roundedRect(palmLeft, palmTop, palmRight, palmBot, 12);

  const fingerW = 13;
  const fingerH = Math.max(10, 26 - hy);
  const fingerGap = 4;
  for (let fi = 0; fi < 4; fi++) {
    const fx = palmLeft + 4 + fi * (fingerW + fingerGap);
    roundedRect(fx, palmTop - fingerH + 6, fx + fingerW, palmTop + 6, 5);
  }

  roundedRect(palmLeft - 10, palmTop + 12, palmLeft + 4, palmTop + 32, 5);

  return buf;
}

// render one frame

async function renderFrame(spriteRgba, spriteW, spriteH, frame, g) {
  const cf = getSpriteFrame(frame, g);

  const dw = Math.abs(cf.dw);
  const dh = Math.abs(cf.dh);

  let scaledSprite = await sharp(spriteRgba, {
    raw: { width: spriteW, height: spriteH, channels: 4 },
  })
    .resize(dw, dh, { fit: "fill" })
    .raw()
    .toBuffer();

  if (g.flip) {
    const flipped = Buffer.alloc(scaledSprite.length);
    for (let row = 0; row < dh; row++)
      for (let col = 0; col < dw; col++) {
        const src = (row * dw + col) * 4;
        const dst = (row * dw + (dw - 1 - col)) * 4;
        flipped[dst] = scaledSprite[src];
        flipped[dst + 1] = scaledSprite[src + 1];
        flipped[dst + 2] = scaledSprite[src + 2];
        flipped[dst + 3] = scaledSprite[src + 3];
      }
    scaledSprite = flipped;
  }

  const canvas = Buffer.alloc(OUT_SIZE * OUT_SIZE * 4, 255);

  for (let row = 0; row < dh; row++) {
    const cy = cf.dy + row;
    if (cy < 0 || cy >= OUT_SIZE) continue;
    for (let col = 0; col < dw; col++) {
      const cx = cf.dx + col;
      if (cx < 0 || cx >= OUT_SIZE) continue;
      const si = (row * dw + col) * 4;
      const di = (cy * OUT_SIZE + cx) * 4;
      const alpha = scaledSprite[si + 3] / 255;
      if (alpha === 0) continue;
      canvas[di] = ~~(scaledSprite[si] * alpha + canvas[di] * (1 - alpha));
      canvas[di + 1] = ~~(
        scaledSprite[si + 1] * alpha +
        canvas[di + 1] * (1 - alpha)
      );
      canvas[di + 2] = ~~(
        scaledSprite[si + 2] * alpha +
        canvas[di + 2] * (1 - alpha)
      );
      canvas[di + 3] = 255;
    }
  }

  const handDy = Math.max(0, ~~(cf.dy * 0.75 - Math.max(0, g.spriteY) - 0.5));
  const handBuf = drawHand(frame, OUT_SIZE, OUT_SIZE);

  for (let row = 0; row < OUT_SIZE; row++) {
    const cy = handDy + row;
    if (cy >= OUT_SIZE) break;
    for (let col = 0; col < OUT_SIZE; col++) {
      const si = (row * OUT_SIZE + col) * 4;
      const di = (cy * OUT_SIZE + col) * 4;
      const alpha = handBuf[si + 3] / 255;
      if (alpha === 0) continue;
      canvas[di] = ~~(handBuf[si] * alpha + canvas[di] * (1 - alpha));
      canvas[di + 1] = ~~(
        handBuf[si + 1] * alpha +
        canvas[di + 1] * (1 - alpha)
      );
      canvas[di + 2] = ~~(
        handBuf[si + 2] * alpha +
        canvas[di + 2] * (1 - alpha)
      );
      canvas[di + 3] = 255;
    }
  }

  return canvas;
}

// build gif

async function makePetpetGif(imageBuffer, opts = {}) {
  const { data, info } = await sharp(imageBuffer)
    .resize(CACHE_SIZE, CACHE_SIZE, {
      fit: "inside",
      withoutEnlargement: false,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const spriteWidth = 112;
  const spriteHeight = Math.max(
    1,
    ~~(spriteWidth * (info.height / info.width)),
  );

  const g = {
    ...DEFAULTS,
    squish: opts.squish ?? DEFAULTS.squish,
    scale: opts.scale ?? DEFAULTS.scale,
    delay: opts.delay ?? DEFAULTS.delay,
    flip: opts.flip ?? DEFAULTS.flip,
    spriteX: DEFAULTS.spriteX,
    spriteY: DEFAULTS.spriteY,
    spriteWidth,
    spriteHeight,
  };

  const encoder = new GIFEncoder(OUT_SIZE, OUT_SIZE, "neuquant", true);
  encoder.setDelay(g.delay);
  encoder.setRepeat(0);
  encoder.setQuality(10);
  encoder.start();

  for (let frame = 0; frame <= MAX_FRAME; frame++) {
    const rgba = await renderFrame(data, info.width, info.height, frame, g);
    encoder.addFrame(new Uint8ClampedArray(rgba));
  }

  encoder.finish();
  return encoder.out.getData();
}

// cloudinary upload

async function uploadToCloudinary(gifBuffer) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Missing Cloudinary env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET",
    );
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const publicId = `petpet_${timestamp}`;
  const folder = "petpet";

  const paramsToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash("sha1")
    .update(paramsToSign + apiSecret)
    .digest("hex");

  const form = new FormData();
  form.append(
    "file",
    new Blob([gifBuffer], { type: "image/gif" }),
    "petpet.gif",
  );
  form.append("api_key", apiKey);
  form.append("timestamp", timestamp);
  form.append("public_id", publicId);
  form.append("folder", folder);
  form.append("signature", signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: "POST",
      body: form,
    },
  );
  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      `Cloudinary upload failed: ${data?.error?.message ?? res.status}`,
    );
  }

  return data.secure_url;
}

// image fetcher thingy

async function fetchImage(url, slackToken) {
  const headers = {};
  const isSlack = url.includes("slack.com") || url.includes("files.slack.com");
  if (isSlack && slackToken) headers["Authorization"] = `Bearer ${slackToken}`;

  const res = await fetch(url, { headers });

  if (res.status === 401 && isSlack)
    throw Object.assign(
      new Error(
        "Slack 401: provide a valid slack_token param or set SLACK_BOT_TOKEN.",
      ),
      { status: 422 },
    );
  if (!res.ok)
    throw Object.assign(
      new Error(`Failed to fetch image — HTTP ${res.status}`),
      { status: 422 },
    );

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.startsWith("image/"))
    throw Object.assign(
      new Error(`URL did not return an image (content-type: "${ct}")`),
      { status: 422 },
    );

  return Buffer.from(await res.arrayBuffer());
}

// handle vercel

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "GET")
    return res.status(405).json({ error: "Only GET requests are supported." });

  const { image_url, slack_token, squish, scale, delay, flip } = req.query;

  if (!image_url)
    return res.status(400).json({ error: "Missing required param: image_url" });

  const token = slack_token || process.env.SLACK_BOT_TOKEN;
  const opts = {
    squish: squish !== undefined ? parseFloat(squish) : undefined,
    scale: scale !== undefined ? parseFloat(scale) : undefined,
    delay: delay !== undefined ? parseInt(delay) : undefined,
    flip: flip === "true",
  };

  let imageBuffer;
  try {
    imageBuffer = await fetchImage(image_url, token);
  } catch (err) {
    return res.status(err.status ?? 502).json({ error: err.message });
  }

  let gifBuffer;
  try {
    gifBuffer = await makePetpetGif(imageBuffer, opts);
  } catch (err) {
    return res
      .status(500)
      .json({ error: `GIF generation failed: ${err.message}` });
  }

  let gifUrl;
  try {
    gifUrl = await uploadToCloudinary(gifBuffer);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({
    gif_url: gifUrl,
    size_kb: Math.round((gifBuffer.length / 1024) * 10) / 10,
  });
}
