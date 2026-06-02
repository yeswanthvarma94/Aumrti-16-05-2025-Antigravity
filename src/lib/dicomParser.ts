/**
 * Lightweight client-side DICOM parser.
 * Extracts metadata tags and renders JPEG-compressed images
 * (X-ray, USG, mammography) directly in the browser.
 * For raw 12/16-bit CT/MRI pixels, metadata is returned and
 * the caller should offer a download link.
 */

export interface DicomMetadata {
  // Patient / study
  patientName?: string;
  patientId?: string;
  studyDate?: string;
  studyDescription?: string;
  // Series
  modality?: string;
  seriesDescription?: string;
  seriesNumber?: number;
  instanceNumber?: number;
  // UIDs
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
  sopInstanceUID?: string;
  sopClassUID?: string;
  transferSyntaxUID?: string;
  // Image geometry
  rows?: number;
  columns?: number;
  numberOfFrames?: number;
  bitsAllocated?: number;
  // Derived
  isJpegCompressed: boolean;
  imageDataUrl?: string;  // blob URL for browser <img> rendering (revoke when done)
  parseError?: string;
}

// Transfer Syntax UIDs that carry JPEG-compressed pixel data
const JPEG_SYNTAXES = new Set([
  "1.2.840.10008.1.2.4.50",  // JPEG Baseline (Process 1) — most common X-ray / USG
  "1.2.840.10008.1.2.4.51",  // JPEG Extended (Process 2 & 4)
  "1.2.840.10008.1.2.4.57",  // JPEG Lossless, Non-Hierarchical (Process 14)
  "1.2.840.10008.1.2.4.70",  // JPEG Lossless, Non-Hierarchical (Process 14, SV1)
]);

// JPEG 2000 — most modern USG / digital mammo
const JP2_SYNTAXES = new Set([
  "1.2.840.10008.1.2.4.90",  // JPEG 2000 Lossless
  "1.2.840.10008.1.2.4.91",  // JPEG 2000 Lossy
]);

function u16le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}
function u32le(b: Uint8Array, o: number): number {
  return ((b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0);
}
function readStr(b: Uint8Array, o: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = b[o + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim().replace(/\^/g, " ");
}

/** Parse a DICOM file from an ArrayBuffer. Returns metadata + optional image URL. */
export function parseDicomBuffer(buf: ArrayBuffer): DicomMetadata {
  const b = new Uint8Array(buf);
  const meta: DicomMetadata = { isJpegCompressed: false };

  if (b.length < 132) {
    meta.parseError = "File too small to be a valid DICOM file.";
    return meta;
  }

  // DICOM preamble + "DICM" magic at bytes 128-131
  if (
    b[128] !== 0x44 || b[129] !== 0x49 ||
    b[130] !== 0x43 || b[131] !== 0x4d
  ) {
    meta.parseError = "Not a valid DICOM file (missing DICM prefix).";
    return meta;
  }

  let offset = 132;
  let transferSyntax = "1.2.840.10008.1.2"; // default: Implicit VR Little Endian
  let explicitVR = true;                      // File Meta is always Explicit VR
  let inFileMeta = true;
  let pixelDataOffset = -1;

  try {
    while (offset + 8 <= b.length) {
      const group   = u16le(b, offset);
      const element = u16le(b, offset + 2);
      const tag     = (group << 16) | element;

      // After File Meta group (0002), switch to transfer syntax mode
      if (inFileMeta && group > 0x0002) {
        inFileMeta = false;
        explicitVR = transferSyntax !== "1.2.840.10008.1.2";
      }

      offset += 4;

      let valueLength: number;
      let dataOffset: number;

      if (explicitVR) {
        const vr = String.fromCharCode(b[offset], b[offset + 1]);
        offset += 2;

        if (["OB","OW","OF","SQ","UC","UR","UT","UN"].includes(vr)) {
          offset += 2; // reserved bytes
          valueLength = u32le(b, offset);
          offset += 4;
        } else {
          valueLength = u16le(b, offset);
          offset += 2;
        }
        dataOffset = offset;
      } else {
        valueLength = u32le(b, offset);
        offset += 4;
        dataOffset = offset;
      }

      // Handle undefined length (sequences / encapsulated pixel data)
      if (valueLength === 0xFFFFFFFF) {
        if (tag === 0x7FE00010) {
          pixelDataOffset = offset; // encapsulated pixel data starts here
        }
        // Skip past this item — find the sequence delimiter (FFFE,E0DD) or pixel data delimiter
        // Simple strategy: skip forward up to 4 bytes to continue parsing other tags
        offset += 4;
        continue;
      }

      // Guard against corrupt length
      if (dataOffset + valueLength > b.length) break;

      switch (tag) {
        case 0x00020010: { // Transfer Syntax UID (File Meta)
          transferSyntax = readStr(b, dataOffset, valueLength);
          meta.transferSyntaxUID = transferSyntax;
          break;
        }
        case 0x00080016: meta.sopClassUID       = readStr(b, dataOffset, valueLength); break;
        case 0x00080018: meta.sopInstanceUID    = readStr(b, dataOffset, valueLength); break;
        case 0x00080020: meta.studyDate         = readStr(b, dataOffset, valueLength); break;
        case 0x00080060: meta.modality          = readStr(b, dataOffset, valueLength); break;
        case 0x00081030: meta.studyDescription  = readStr(b, dataOffset, valueLength); break;
        case 0x0008103E: meta.seriesDescription = readStr(b, dataOffset, valueLength); break;
        case 0x00100010: meta.patientName       = readStr(b, dataOffset, valueLength); break;
        case 0x00100020: meta.patientId         = readStr(b, dataOffset, valueLength); break;
        case 0x0020000D: meta.studyInstanceUID  = readStr(b, dataOffset, valueLength); break;
        case 0x0020000E: meta.seriesInstanceUID = readStr(b, dataOffset, valueLength); break;
        case 0x00200011:
          if (valueLength === 2) meta.seriesNumber = u16le(b, dataOffset);
          break;
        case 0x00200013:
          if (valueLength === 2) meta.instanceNumber = u16le(b, dataOffset);
          break;
        case 0x00280008: {
          const nf = parseInt(readStr(b, dataOffset, valueLength), 10);
          if (!isNaN(nf)) meta.numberOfFrames = nf;
          break;
        }
        case 0x00280010: meta.rows          = u16le(b, dataOffset); break;
        case 0x00280011: meta.columns       = u16le(b, dataOffset); break;
        case 0x00280100: meta.bitsAllocated = u16le(b, dataOffset); break;
        case 0x7FE00010: {
          // Defined-length pixel data: raw bytes start here
          pixelDataOffset = dataOffset;
          break;
        }
      }

      offset = dataOffset + valueLength;
      if (offset % 2 !== 0) offset++; // DICOM elements are word-aligned
    }
  } catch {
    meta.parseError = "Error parsing DICOM data elements.";
  }

  // ---------------------------------------------------------------
  // Extract renderable image from JPEG / JPEG 2000 pixel data
  // ---------------------------------------------------------------
  const isJpeg  = JPEG_SYNTAXES.has(transferSyntax);
  const isJp2   = JP2_SYNTAXES.has(transferSyntax);
  meta.isJpegCompressed = isJpeg || isJp2;

  if (meta.isJpegCompressed && pixelDataOffset >= 0) {
    // In encapsulated format the basic offset table occupies the first item.
    // Scan for the JPEG SOI (FF D8) or JPEG 2000 SOC (FF 4F) marker.
    const soi: [number, number] = isJp2 ? [0xFF, 0x4F] : [0xFF, 0xD8];
    let jpegStart = -1;

    const searchEnd = Math.min(pixelDataOffset + 4096, b.length - 1);
    for (let i = pixelDataOffset; i < searchEnd; i++) {
      if (b[i] === soi[0] && b[i + 1] === soi[1]) {
        jpegStart = i;
        break;
      }
    }

    if (jpegStart >= 0) {
      let jpegEnd = b.length;

      if (isJpeg) {
        // Find JPEG EOI marker (FF D9)
        for (let i = jpegStart + 2; i < b.length - 1; i++) {
          if (b[i] === 0xFF && b[i + 1] === 0xD9) {
            jpegEnd = i + 2;
            break;
          }
        }
      }
      // For JPEG 2000, take all remaining bytes up to file end
      // (most DICOM JP2 wrappings end at the item delimiter)

      const mimeType = isJp2 ? "image/jp2" : "image/jpeg";
      const blob = new Blob([b.slice(jpegStart, jpegEnd)], { type: mimeType });
      meta.imageDataUrl = URL.createObjectURL(blob);
    }
  }

  return meta;
}

/** Parse a DICOM File object (from <input type="file">) */
export async function parseDicomFile(file: File): Promise<DicomMetadata> {
  const buf = await file.arrayBuffer();
  return parseDicomBuffer(buf);
}

/** Parse a DICOM file reachable via a signed URL */
export async function parseDicomFromUrl(url: string): Promise<DicomMetadata> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch DICOM file: ${res.status}`);
  const buf = await res.arrayBuffer();
  return parseDicomBuffer(buf);
}

/** Format a raw DICOM date string (YYYYMMDD) → DD-MMM-YYYY */
export function formatDicomDate(raw: string): string {
  if (!raw || raw.length !== 8) return raw ?? "";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const y = raw.slice(0, 4);
  const m = parseInt(raw.slice(4, 6), 10);
  const d = raw.slice(6, 8);
  return `${d}-${months[m - 1] ?? "???"}-${y}`;
}
