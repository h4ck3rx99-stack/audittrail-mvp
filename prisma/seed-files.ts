// Generates small sample evidence files for the demo seed. Every file visibly carries the
// "SAMPLE DEMO EVIDENCE · NOT REAL" marking.
import { deflateSync } from "node:zlib";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const DEMO_MARK = "SAMPLE DEMO EVIDENCE · NOT REAL";

export async function demoPdf(title: string, lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${title} (${DEMO_MARK})`);
  doc.setProducer("AuditTrail demo seed");
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText(DEMO_MARK, { x: 48, y: 740, size: 12, font: bold, color: rgb(0.7, 0.1, 0.1) });
  page.drawText(title, { x: 48, y: 700, size: 18, font: bold });
  let y = 660;
  for (const line of lines) {
    page.drawText(line, { x: 48, y, size: 11, font });
    y -= 18;
  }
  page.drawText(DEMO_MARK, { x: 48, y: 48, size: 9, font, color: rgb(0.7, 0.1, 0.1) });
  return doc.save();
}

export function demoCsv(header: string[], rows: string[][]): Uint8Array {
  const lines = [`# ${DEMO_MARK}`, header.join(","), ...rows.map((r) => r.join(","))];
  return Buffer.from(`${lines.join("\n")}\n`, "utf8");
}

export function demoText(title: string, lines: string[]): Uint8Array {
  return Buffer.from([DEMO_MARK, "", title, "=".repeat(title.length), "", ...lines, "", DEMO_MARK, ""].join("\n"), "utf8");
}

// ─── PNG with visible text (5×7 bitmap font, no native dependencies) ────────

const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "·": ["00000", "00000", "00000", "00100", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ":": ["00000", "00100", "00000", "00000", "00000", "00100", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00000", "00100"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

/** Renders lines of uppercase text into a grayscale PNG ("screenshot" evidence). */
export function demoPng(lines: string[], scale = 3): Uint8Array {
  const text = [DEMO_MARK, "", ...lines.map((l) => l.toUpperCase()), "", DEMO_MARK];
  const charW = 6 * scale;
  const lineH = 10 * scale;
  const pad = 8 * scale;
  const width = Math.max(...text.map((l) => [...l].length)) * charW + pad * 2;
  const height = text.length * lineH + pad * 2;
  const pixels = Buffer.alloc((width + 1) * height, 0xff);
  for (let y = 0; y < height; y++) pixels[y * (width + 1)] = 0; // filter byte per row
  text.forEach((line, li) => {
    [...line].forEach((ch, ci) => {
      const glyph = FONT[ch] ?? FONT[" "]!;
      for (let gy = 0; gy < 7; gy++) {
        for (let gx = 0; gx < 5; gx++) {
          if (glyph[gy]![gx] !== "1") continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const x = pad + ci * charW + gx * scale + sx;
              const y = pad + li * lineH + gy * scale + sy;
              pixels[y * (width + 1) + 1 + x] = li === 0 || li === text.length - 1 ? 0x80 : 0x20;
            }
          }
        }
      }
    });
  });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
