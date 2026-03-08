import sharp from "sharp";
import GIFEncoder from "gif-encoder-2";
import fetch from "node-fetch";
import crypto from "crypto";

// constants

const HAND_SPRITE_B64 = "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";

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

// hand sprite get
let _handSheetPromise = null;
function getHandSheet() {
  if (!_handSheetPromise) {
    _handSheetPromise = sharp(Buffer.from(HAND_SPRITE_B64, "base64"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  }
  return _handSheetPromise;
}

async function getHandFrame(frame) {
  const { data, info } = await getHandSheet();
  const frameW = info.width / 5;
  const frameH = info.height;
  const buf = Buffer.alloc(frameW * frameH * 4, 0);
  for (let row = 0; row < frameH; row++) {
    const srcOffset = (row * info.width + frame * frameW) * 4;
    const dstOffset = row * frameW * 4;
    data.copy(buf, dstOffset, srcOffset, srcOffset + frameW * 4);
  }
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
  const handBuf = await getHandFrame(frame);

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
    size_kb: Math.round(gifBuffer.length / 1024 * 10) / 10,
  });
}
