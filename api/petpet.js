import { createCanvas, loadImage } from "@napi-rs/canvas";
import GIFEncoder from "gifencoder";
import fetch from "node-fetch";
import crypto from "crypto";

// constants
const MAX_FRAME = 4;
const OUT_SIZE = 112;

const DEFAULTS = {
    squish: 1.25,
    scale: 0.875,
    delay: 60,
    spriteX: 14,
    spriteY: 20,
    spriteWidth: 112,
    spriteHeight: 112,
    flip: false,
};

const FRAME_OFFSETS = [
    { x: 0, y: 0, w: 0, h: 0 },
    { x: -4, y: 12, w: 4, h: -12 },
    { x: -12, y: 18, w: 12, h:-18 },
    { x: -8, y: 12, w: 4, h: -12 },
    { x: -4, y: 0, w: 0, h: 0 },
];

// main shit
function getSpriteFrame(frame, g) {
    const o = FRAME_OFFSETS[frame];
    return {
        dx: ~~(g.spriteX + o.x * (g.squish * 0.4)),
        dy: ~~(g.spriteY + o.y * (g.squish * 0.9)),
        dw: ~~((g.spriteWidth + o.w * g.squish) * g.scale),
        dh: ~~((g.spriteHeight + o.h * g.squish) * g.scale),
    };
}

function renderFrame(ctx, sprite, hand, frame, g) {
    const cf = getSpriteFrame(frame, g);

    ctx.clearRect(0, 0, OUT_SIZE, OUT_SIZE);
    ctx.save();
    ctx.translate(cf.dx, cf.dy);

    if (g.flip) {
        ctx.scale(-1, 1);
        cf.dw *= -1;
    }

    ctx.drawImage(sprite, 0, 0, cf.dw, cf.dh);
    ctx.restore();

    const handDy = Math.max(0, ~~(cf.dy * 0.75 - Math.max(0, g.spriteY) - 0.5));
    ctx.drawImage(
        hand,
        frame * OUT_SIZE, 0,
        OUT_SIZE, OUT_SIZE,
        0, handDy,
        OUT_SIZE, OUT_SIZE
    );
}

// hand sprite

function makeHandSheet() {
    const sheet = createCanvas(OUT_SIZE * OUT_SIZE);
    const ctx = sheet.getContext("2d");

    const handYOffsets = [0, 4, 9, 4, 0];

    for (let f = 0; f < 5; f++) {
        const xOff = f * OUT_SIZE;
        const hy = handYOffsets[f];

        const palmTop = 10 + hy;
        const palmLeft = 18;
        const palmW = 72;
        const palmH = 62;

        ctx.fillStyle = "#FFDC97"
        ctx.strokeStyle = "#785028";
        ctx.lineWidth = 2;

        roundRect(ctx, xOff + palmLeft, palmTop, palmW, palmH, 14);
        ctx.fill();
        ctx.stroke();

        const fingerW = 14;
        const fingerH = Math.max(10, 28 - hy);
        const fingerGap = 4;
        for (let fi = 0; fi < 4; fi++) {
            const fx = xOff + palmLeft + 4 + fi * (fingerW + fingerGap);
            const fy = palmTop - fingerH + 8;
            roundRect(ctx, fx, fy, fingerW, fingerH + 8, 6);
            ctx.fill();
            ctx.stroke();
        }

        roundRect(ctx, xOff + palmLeft - 10, palmTop + 14, 14, 24, 6);
        ctx.fill();
        ctx.stroke();
    }

    return sheet;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - 4, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// gif builder

async function makePetpetGif(imageBuffer, opts = {}) {
    const g = {
        ...DEFAULTS,
        squish: opts.squish ?? DEFAULTS.squish,
        scale: opts.scale ?? DEFAULTS.scale,
        delay: opts.delay ?? DEFAULTS.delay,
        flip: opts.flip ?? DEFAULTS.flip,
    };

    const sprite = await loadImage(imageBuffer);
    g.spriteWidth = DEFAULTS.spriteWidth;
    g.spriteHeight = ~~(DEFAULTS.spriteWidth * (sprite.height / sprite.width));

    const hand = makeHandSheet();

    const encoder = new GIFEncoder(OUT_SIZE, OUT_SIZE);
    const chunks = [];
    encoder.createReadStream().on("data", (chunk) => chunks.push(chunk));

    encoder.start();
    encoder.setRepeat(0);
    encoder.setDelay(g.delay);
    encoder.setQuality(10);
    encoder.setTransparent(null);

    const canvas = createCanvas(OUT_SIZE, OUT_SIZE);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    for(let frame = 0; frame <= MAX_FRAME; frame++) {
        renderFrame(ctx, sprite, hand, frame, g);
        encoder.addFrame(ctx);
    }

    encoder.finish();
    
    return Buffer.concat(chunks);
}

// cloudinary upload

async function uploadToCloudinary(gifBuffer) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
        throw new Error("Missing Cloudinary env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET");
    }

    const timestamp = String(Math.floor(Date.now() / 1000));
    const publicId = `petpet_${timestamp}`;
    const folder = "petpet"

    const paramsToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
    const signature = crypto.createHash("sha1").update(paramsToSign + apiSecret).digest("hex");

    const form = new FormData();
    form.append("file", new Blob([gifBuffer], { type: "image/gif" }), "petpet.gif");
    form.append("api_key", apiKey);
    form.append("timestamp", timestamp);
    form.append("public_id", publicId);
    form.append("folder", folder);
    form.append("signature", signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: form,
    });
    const data = await res.json();

    if (!res.ok) {
        throw new Error(`Cloudinary upload failed: ${data?.error?.message ?? res.status}`);
    }

    return data.secure_url;
}

// image fetch thingy

async function fetchImage(url, slackToken) {
    const header = {};
    const isSlack = url.includes("slack.com") || url.includes("files.slack.com");

    if (isSlack && slackToken) {
        headers["Authorization"] = `Bearer ${slackToken}`;
    }

    const res = await fetch(url, { headers });

    if (res.status === 401 && isSlack) {
        throw Object.assign(
            new Error("Slack returned 401. Provide a valid slack_token param or set SLACK_BOT_TOKEN."),
            { status: 422 }
        );
    }

    if (!res.ok) {
        throw Object.assign(
            new Error(`Failed to fetch image, HTTP ${res.status} from ${url}`),
            { status: 422 }
        );
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
        throw Object.assign(
            new Error(`URL did not return an image (content-type: "${contentType}")`),
            { status: 422 }
        );
    }

    return Buffer.from(await res.arrayBuffer());
}

// vercel handler thingy

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        return res.status(204).end();
    }

    if (req.method !== "GET") {
        return res.status(405).json({ error: "Only GET requests are supported." });
    }

    const { image_url, slack_token, squish, scale, delay, flip } = req.query;

    if (!image_url) {
        return res.status(400).json({ error: "Missing required param: image_url" });
    }

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
        return res.status(500).json({ error: `GIF generation failed: ${err.message}` });
    }

    let gifUrl;
    try {
        gifUrl = await uploadToCloudinary(gifBuffer);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }

    return res.status(200).json({
        gif_url: gifUrl,
        size_kb: Math.round(gifBuffer.length / 1024 * 10 ) / 10,
    });
}