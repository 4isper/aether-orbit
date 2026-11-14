import { encode } from 'uqr'

export interface Qr {
  /** The symbol's side in modules — the SVG viewBox is exactly this square. */
  size: number
  /** The full module matrix, top row first, dark = true. No quiet zone:
   * the plate around the rendered code is the quiet zone. */
  modules: boolean[][]
  /** Every dark module as a unit square in one path, so the dialog can
   * fill the code with its own palette. */
  path: string
}

/** The frame link as a scannable code. The whole decision about what a QR
 * is made of lives here; the dialog only paints what this returns. */
export function qrCode(text: string): Qr {
  const { size, data } = encode(text, { border: 0 })
  let path = ''
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y][x]) path += `M${x} ${y}h1v1h-1z`
    }
  }
  return { size, modules: data, path }
}
