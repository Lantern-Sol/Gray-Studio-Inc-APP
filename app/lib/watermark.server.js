import sharp from "sharp";

// Diagonal repeated-text watermark, composited server-side via sharp so the clean file
// underneath is never sent to the browser — it can't be stripped client-side.
export async function watermarkImage(buffer, { text = "PREVIEW" } = {}) {
  const image = sharp(buffer);
  const { width = 1024, height = 1024 } = await image.metadata();

  const tile = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .wm { fill: rgba(255,255,255,0.35); font-size: 42px; font-family: sans-serif; font-weight: 700; }
      </style>
      ${Array.from({ length: 5 })
        .map((_, row) =>
          Array.from({ length: 4 })
            .map((__, col) => {
              const x = col * (width / 3) - width / 8;
              const y = row * (height / 4) + 40;
              return `<text class="wm" x="${x}" y="${y}" transform="rotate(-30 ${x} ${y})">${text}</text>`;
            })
            .join(""),
        )
        .join("")}
    </svg>
  `);

  return image
    .composite([{ input: tile, top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}
