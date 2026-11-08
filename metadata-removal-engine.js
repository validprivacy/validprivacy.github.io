(() => {
  const MAX_IN_MEMORY_BYTES = 300 * 1024 * 1024
  const MAX_MOOV_BYTES = 512 * 1024 * 1024
  const ZIP_MAX_BYTES = 0xFFFFFFFF - 1024 * 1024
  const ZIP_MAX_ENTRIES = 65000
  const CRC_CHUNK = 8 * 1024 * 1024

  const LABEL_LOCATION = 'Location (GPS)'
  const LABEL_DEVICE = 'Camera or device details'
  const LABEL_DATE = 'Date and time'
  const LABEL_SOFTWARE = 'Software used'
  const LABEL_AUTHOR = 'Author, owner, or copyright'
  const LABEL_COMMENTS = 'Comments, titles, or captions'
  const LABEL_XMP = 'Editing history (XMP)'
  const LABEL_IPTC = 'Captions, keywords, and creator (IPTC)'
  const LABEL_PREVIEW = 'Hidden preview images'
  const LABEL_UNIQUE_ID = 'Unique ID'
  const LABEL_MAKER = 'Manufacturer data'
  const LABEL_TRAILING = 'Hidden data after the image'
  const LABEL_OTHER = 'Other embedded data'
  const LABEL_TAGS = 'Title, artist, and album tags'
  const LABEL_COVER = 'Embedded cover art'
  const LABEL_RECORDED = 'Recording date'
  const LABEL_TRACK = 'GPS and sensor data track'

  const KIND_JPEG = 'JPEG image'
  const KIND_PNG = 'PNG image'
  const KIND_WEBP = 'WebP image'
  const KIND_MP4 = 'MP4, MOV, or M4A'
  const KIND_MP3 = 'MP3 audio'
  const KIND_WAV = 'WAV audio'
  const KIND_FLAC = 'FLAC audio'
  const KIND_HEIC = 'HEIC photo'

  const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'avif', 'avis', 'mif2'])
  const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'])
  const XMP_PLACEHOLDER = '<x:xmpmeta xmlns:x="adobe:ns:meta/"/>'
  const MP4_TOP_KEEP = new Set(['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'pdin', 'moof', 'mfra', 'sidx', 'ssix', 'styp', 'emsg', 'prft'])
  const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'bKGD', 'pHYs', 'acTL', 'fcTL', 'fdAT', 'cICP', 'mDCv', 'cLLi'])
  const MP4_VISUAL = new Set(['avc1', 'avc3', 'hvc1', 'hev1', 'mp4v', 'vp08', 'vp09', 'av01', 'apch', 'apcn', 'apcs', 'apco', 'ap4h', 'ap4x', 'jpeg', 'mjpa', 'mjpb', 's263', 'h263', 'dvh1', 'dvhe'])
  const MP4_CONTAINERS = new Set(['trak', 'mdia', 'minf', 'stbl'])
  const DATA_TRACK_ENTRIES = new Set(['gpmd', 'camm', 'rtmd', 'mebx', 'mett', 'metx', 'djmd', 'dbgi'])
  const WAV_KEEP = new Set(['fmt ', 'data', 'fact', 'cue ', 'smpl', 'inst', 'plst'])

  class UnsupportedError extends Error {}

  function ascii(bytes, start, length) {
    let s = ''
    for (let i = 0; i < length && start + i < bytes.length; i++) s += String.fromCharCode(bytes[start + i])
    return s
  }

  function asciiBytes(text) {
    const out = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i)
    return out
  }

  function includesAscii(bytes, text) {
    const needle = asciiBytes(text)
    const first = needle[0]
    const last = bytes.length - needle.length
    outer: for (let i = 0; i <= last; i++) {
      if (bytes[i] !== first) continue
      for (let j = 1; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer
      return true
    }
    return false
  }

  function u32be(b, p) { return ((b[p] << 24) >>> 0) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3] }
  function u32le(b, p) { return ((b[p + 3] << 24) >>> 0) + (b[p + 2] << 16) + (b[p + 1] << 8) + b[p] }
  function u24be(b, p) { return (b[p] << 16) + (b[p + 1] << 8) + b[p + 2] }
  function syncsafe(b, p) { return ((b[p] & 0x7f) << 21) | ((b[p + 1] & 0x7f) << 14) | ((b[p + 2] & 0x7f) << 7) | (b[p + 3] & 0x7f) }

  function putU32le(b, p, v) { b[p] = v & 0xff; b[p + 1] = (v >>> 8) & 0xff; b[p + 2] = (v >>> 16) & 0xff; b[p + 3] = (v >>> 24) & 0xff }
  function putU16le(b, p, v) { b[p] = v & 0xff; b[p + 1] = (v >>> 8) & 0xff }

  async function readRange(file, start, end) {
    return new Uint8Array(await file.slice(start, end).arrayBuffer())
  }

  function readTiff(t, found, state) {
    if (t.length < 8) return
    const little = t[0] === 0x49 && t[1] === 0x49
    if (!little && !(t[0] === 0x4d && t[1] === 0x4d)) return
    const u16 = (p) => little ? (t[p] | (t[p + 1] << 8)) : ((t[p] << 8) | t[p + 1])
    const u32 = (p) => little ? u32le(t, p) : u32be(t, p)
    const seen = new Set()
    const ifd = (offset) => {
      const entries = new Map()
      if (offset < 8 || offset + 2 > t.length || seen.has(offset)) return { entries, next: 0 }
      seen.add(offset)
      const count = u16(offset)
      for (let i = 0; i < count; i++) {
        const e = offset + 2 + i * 12
        if (e + 12 > t.length) break
        entries.set(u16(e), { type: u16(e + 2), count: u32(e + 4), at: e + 8 })
      }
      const nextAt = offset + 2 + count * 12
      return { entries, next: nextAt + 4 <= t.length ? u32(nextAt) : 0 }
    }
    const rationals = (entry) => {
      if (!entry || entry.type !== 5 || entry.count < 3) return null
      const base = u32(entry.at)
      if (base + 24 > t.length) return null
      const values = []
      for (let i = 0; i < 3; i++) {
        const num = u32(base + i * 8)
        const den = u32(base + i * 8 + 4)
        values.push(den ? num / den : 0)
      }
      return values[0] + values[1] / 60 + values[2] / 3600
    }
    const refChar = (entry) => entry ? String.fromCharCode(t[entry.at]) : ''
    const ifd0 = ifd(u32(4))
    const has = (map, tags, label) => { for (const tag of tags) if (map.has(tag)) { found.add(label); return } }
    has(ifd0.entries, [0x010f, 0x0110], LABEL_DEVICE)
    has(ifd0.entries, [0x0131], LABEL_SOFTWARE)
    has(ifd0.entries, [0x0132], LABEL_DATE)
    has(ifd0.entries, [0x013b, 0x8298], LABEL_AUTHOR)
    has(ifd0.entries, [0x010e, 0x9c9b, 0x9c9c, 0x9c9d, 0x9c9e, 0x9c9f], LABEL_COMMENTS)
    has(ifd0.entries, [0x02bc], LABEL_XMP)
    has(ifd0.entries, [0x83bb], LABEL_IPTC)
    const orientation = ifd0.entries.get(0x0112)
    if (orientation && orientation.type === 3) {
      const value = u16(orientation.at)
      if (value >= 1 && value <= 8) state.orientation = value
    }
    const exifPointer = ifd0.entries.get(0x8769)
    if (exifPointer) {
      const exif = ifd(u32(exifPointer.at))
      has(exif.entries, [0x9003, 0x9004, 0x9010, 0x9011, 0x9290, 0x9291, 0x9292], LABEL_DATE)
      has(exif.entries, [0xa430, 0xa431, 0xa432, 0xa433, 0xa434, 0xa435], LABEL_DEVICE)
      has(exif.entries, [0x927c], LABEL_MAKER)
      has(exif.entries, [0x9286], LABEL_COMMENTS)
      has(exif.entries, [0xa420], LABEL_UNIQUE_ID)
    }
    const gpsPointer = ifd0.entries.get(0x8825)
    if (gpsPointer) {
      const gps = ifd(u32(gpsPointer.at))
      if (gps.entries.size) found.add(LABEL_LOCATION)
      const lat = rationals(gps.entries.get(0x0002))
      const lon = rationals(gps.entries.get(0x0004))
      if (lat !== null && lon !== null && (lat || lon) && lat <= 90 && lon <= 180) {
        const latSign = refChar(gps.entries.get(0x0001)) === 'S' ? -1 : 1
        const lonSign = refChar(gps.entries.get(0x0003)) === 'W' ? -1 : 1
        state.location = { lat: latSign * lat, lon: lonSign * lon }
      }
    }
    if (ifd0.next) {
      const ifd1 = ifd(ifd0.next)
      if (ifd1.entries.has(0x0201) || ifd1.entries.has(0x0111)) found.add(LABEL_PREVIEW)
    }
  }

  function orientationTiff(value) {
    return new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, value, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
  }

  function orientationSegment(value) {
    const seg = new Uint8Array(36)
    seg[0] = 0xff; seg[1] = 0xe1; seg[2] = 0x00; seg[3] = 34
    seg.set(asciiBytes('Exif\0\0'), 4)
    seg.set(orientationTiff(value), 10)
    return seg
  }

  function noteXmp(bytes, found) {
    found.add(LABEL_XMP)
    if (includesAscii(bytes, 'GPSLatitude') || includesAscii(bytes, 'GPSLongitude')) found.add(LABEL_LOCATION)
    if (includesAscii(bytes, 'CreateDate') || includesAscii(bytes, 'DateTimeOriginal')) found.add(LABEL_DATE)
    if (includesAscii(bytes, 'tiff:Model') || includesAscii(bytes, 'tiff:Make')) found.add(LABEL_DEVICE)
  }

  async function cleanJpeg(file) {
    if (file.size > MAX_IN_MEMORY_BYTES) throw new UnsupportedError('Larger than 300 MB')
    const b = new Uint8Array(await file.arrayBuffer())
    const found = new Set()
    const state = { orientation: 1, location: null }
    const parts = [b.subarray(0, 2)]
    let insertAt = 1
    let p = 2
    let ended = false
    while (p < b.length) {
      if (b[p] !== 0xff) throw new Error('Damaged JPEG')
      const m = b[p + 1]
      if (m === 0xff) { p++; continue }
      if (m === 0xd9) { parts.push(b.subarray(p, p + 2)); p += 2; ended = true; break }
      if ((m >= 0xd0 && m <= 0xd7) || m === 0x01 || m === 0xd8) { parts.push(b.subarray(p, p + 2)); p += 2; continue }
      if (p + 4 > b.length) throw new Error('Damaged JPEG')
      const len = (b[p + 2] << 8) | b[p + 3]
      const end = p + 2 + len
      if (len < 2 || end > b.length) throw new Error('Damaged JPEG')
      const data = b.subarray(p + 4, end)
      if (m === 0xda) {
        let q = end
        while (q < b.length) {
          if (b[q] === 0xff) {
            const n = b[q + 1]
            if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) { q += 2; continue }
            if (n === 0xff) { q++; continue }
            break
          }
          q++
        }
        parts.push(b.subarray(p, q))
        p = q
        continue
      }
      let keep = true
      if (m === 0xe0) {
        keep = ascii(data, 0, 5) === 'JFIF\0'
        if (keep) insertAt = parts.length + 1
        else found.add(LABEL_PREVIEW)
      } else if (m === 0xe1) {
        keep = false
        if (ascii(data, 0, 6) === 'Exif\0\0') readTiff(data.subarray(6), found, state)
        else if (ascii(data, 0, 4) === 'http') noteXmp(data, found)
        else found.add(LABEL_OTHER)
      } else if (m === 0xe2) {
        keep = ascii(data, 0, 12) === 'ICC_PROFILE\0'
        if (!keep) found.add(ascii(data, 0, 4) === 'MPF\0' ? LABEL_PREVIEW : LABEL_OTHER)
      } else if (m === 0xed) {
        keep = false
        found.add(LABEL_IPTC)
      } else if (m === 0xee) {
        keep = ascii(data, 0, 5) === 'Adobe'
        if (!keep) found.add(LABEL_OTHER)
      } else if (m >= 0xe3 && m <= 0xef) {
        keep = false
        found.add(LABEL_MAKER)
      } else if (m === 0xfe) {
        keep = false
        found.add(LABEL_COMMENTS)
      }
      if (keep) parts.push(b.subarray(p, end))
      p = end
    }
    if (!ended) throw new Error('Damaged JPEG')
    for (let i = p; i < b.length; i++) if (b[i] !== 0) { found.add(LABEL_TRAILING); break }
    if (state.orientation > 1) parts.splice(insertAt, 0, orientationSegment(state.orientation))
    return { found, location: state.location, output: new Blob(parts, { type: 'image/jpeg' }) }
  }

  async function cleanPng(file) {
    if (file.size > MAX_IN_MEMORY_BYTES) throw new UnsupportedError('Larger than 300 MB')
    const b = new Uint8Array(await file.arrayBuffer())
    const found = new Set()
    const state = { orientation: 1, location: null }
    const parts = [b.subarray(0, 8)]
    let p = 8
    let ended = false
    while (p + 12 <= b.length) {
      const len = u32be(b, p)
      const type = ascii(b, p + 4, 4)
      const end = p + 12 + len
      if (end > b.length) throw new Error('Damaged PNG')
      const data = b.subarray(p + 8, p + 8 + len)
      if (PNG_KEEP.has(type)) parts.push(b.subarray(p, end))
      else if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
        let k = 0
        while (k < data.length && data[k] !== 0) k++
        const key = ascii(data, 0, k)
        if (key === 'XML:com.adobe.xmp') noteXmp(data, found)
        else if (/^(Author|Copyright|Artist)$/i.test(key)) found.add(LABEL_AUTHOR)
        else if (/time|date/i.test(key)) found.add(LABEL_DATE)
        else if (/software|source/i.test(key)) found.add(LABEL_SOFTWARE)
        else if (/^Raw profile type (exif|APP1)$/i.test(key)) found.add(LABEL_DEVICE)
        else found.add(LABEL_COMMENTS)
      } else if (type === 'eXIf') readTiff(data, found, state)
      else if (type === 'tIME') found.add(LABEL_DATE)
      else found.add(LABEL_OTHER)
      p = end
      if (type === 'IEND') { ended = true; break }
    }
    if (!ended) throw new Error('Damaged PNG')
    if (p < b.length) found.add(LABEL_TRAILING)
    return { found, location: state.location, output: new Blob(parts, { type: 'image/png' }) }
  }

  async function cleanWebp(file) {
    if (file.size > MAX_IN_MEMORY_BYTES) throw new UnsupportedError('Larger than 300 MB')
    const b = new Uint8Array(await file.arrayBuffer())
    const found = new Set()
    const state = { orientation: 1, location: null }
    const kept = []
    let extended = null
    let total = 4
    let p = 12
    const riffEnd = Math.min(b.length, 8 + u32le(b, 4))
    while (p + 8 <= riffEnd) {
      const type = ascii(b, p, 4)
      const len = u32le(b, p + 4)
      const end = p + 8 + len + (len & 1)
      if (p + 8 + len > b.length) throw new Error('Damaged WebP')
      const data = b.subarray(p + 8, p + 8 + len)
      if (type === 'EXIF') {
        readTiff(ascii(data, 0, 6) === 'Exif\0\0' ? data.subarray(6) : data, found, state)
      } else if (type === 'XMP ') {
        noteXmp(data, found)
      } else {
        const chunk = b.slice(p, Math.min(end, b.length))
        if (type === 'VP8X' && chunk.length > 8) { chunk[8] &= ~0x0c; extended = chunk }
        kept.push(chunk)
        total += chunk.length
      }
      p = end
    }
    if (p < b.length) found.add(LABEL_TRAILING)
    if (state.orientation > 1 && extended) {
      extended[8] |= 0x08
      const chunk = new Uint8Array(34)
      chunk.set(asciiBytes('EXIF'), 0)
      putU32le(chunk, 4, 26)
      chunk.set(orientationTiff(state.orientation), 8)
      kept.push(chunk)
      total += chunk.length
    }
    const header = new Uint8Array(12)
    header.set(asciiBytes('RIFF'), 0)
    putU32le(header, 4, total)
    header.set(asciiBytes('WEBP'), 8)
    return { found, location: state.location, output: new Blob([header, ...kept], { type: 'image/webp' }) }
  }

  function boxHeader(b, p, limit) {
    if (p + 8 > limit) return null
    let size = u32be(b, p)
    const type = ascii(b, p + 4, 4)
    let header = 8
    if (size === 1) {
      if (p + 16 > limit) return null
      size = u32be(b, p + 8) * 4294967296 + u32be(b, p + 12)
      header = 16
    } else if (size === 0) size = limit - p
    if (size < header) return null
    return { size, type, header }
  }

  function noteMp4Text(bytes, found) {
    if (includesAscii(bytes, '©xyz') || includesAscii(bytes, 'ISO6709') || includesAscii(bytes, 'loci')) found.add(LABEL_LOCATION)
    if (includesAscii(bytes, '©mak') || includesAscii(bytes, '©mod') || includesAscii(bytes, 'quicktime.make') || includesAscii(bytes, 'quicktime.model')) found.add(LABEL_DEVICE)
    if (includesAscii(bytes, '©swr') || includesAscii(bytes, '©too') || includesAscii(bytes, 'quicktime.software')) found.add(LABEL_SOFTWARE)
    if (includesAscii(bytes, '©day') || includesAscii(bytes, 'creationdate')) found.add(LABEL_DATE)
    if (includesAscii(bytes, '©nam') || includesAscii(bytes, '©ART') || includesAscii(bytes, '©alb')) found.add(LABEL_TAGS)
    if (includesAscii(bytes, 'covr')) found.add(LABEL_COVER)
    if (includesAscii(bytes, '©cmt') || includesAscii(bytes, '©des')) found.add(LABEL_COMMENTS)
    if (includesAscii(bytes, 'XMP_') || includesAscii(bytes, 'xmpmeta')) found.add(LABEL_XMP)
    if (includesAscii(bytes, 'mdta')) {
      if (includesAscii(bytes, 'make') || includesAscii(bytes, 'model')) found.add(LABEL_DEVICE)
      if (includesAscii(bytes, 'title') || includesAscii(bytes, 'artist') || includesAscii(bytes, 'album')) found.add(LABEL_TAGS)
      if (includesAscii(bytes, 'comment') || includesAscii(bytes, 'description')) found.add(LABEL_COMMENTS)
      if (includesAscii(bytes, 'encoder') || includesAscii(bytes, 'software')) found.add(LABEL_SOFTWARE)
      if (includesAscii(bytes, 'creation') || includesAscii(bytes, 'date')) found.add(LABEL_DATE)
    }
    if (bytes.length > 16 && !found.size) found.add(LABEL_OTHER)
  }

  function freeBox(patches, base, b, p, box) {
    const out = new Uint8Array(box.size)
    out.set(b.subarray(p, p + box.header))
    out.set(asciiBytes('free'), 4)
    if (box.header === 16) out.set(b.subarray(p + 8, p + 16), 8)
    patches.push({ at: base + p, bytes: out })
  }

  function zeroTimes(patches, base, b, p, box, found) {
    const s = p + box.header
    const version = b[s]
    const width = version === 1 ? 16 : 8
    if (s + 4 + width > p + box.size) return
    let nonzero = false
    for (let i = 0; i < width; i++) if (b[s + 4 + i]) nonzero = true
    if (!nonzero) return
    found.add(LABEL_RECORDED)
    patches.push({ at: base + s + 4, bytes: new Uint8Array(width) })
  }

  function blankCompressorNames(b, base, start, limit, patches, found) {
    let q = start
    while (q + 8 <= limit) {
      const entry = boxHeader(b, q, limit)
      if (!entry || q + entry.size > limit) return
      const nameAt = q + 50
      if (MP4_VISUAL.has(entry.type) && entry.header === 8 && nameAt + 32 <= q + entry.size) {
        let used = false
        for (let i = 0; i < 32; i++) if (b[nameAt + i]) used = true
        if (used) {
          found.add(LABEL_SOFTWARE)
          patches.push({ at: base + nameAt, bytes: new Uint8Array(32) })
        }
      }
      q += entry.size
    }
  }

  function inspectTrak(b, start, end, info) {
    let p = start
    while (p < end) {
      const box = boxHeader(b, p, end)
      if (!box || p + box.size > end) return
      const body = p + box.header
      if (box.type === 'mdia' || box.type === 'minf' || box.type === 'stbl') inspectTrak(b, body, p + box.size, info)
      else if (box.type === 'hdlr') info.handler = ascii(b, body + 8, 4)
      else if (box.type === 'stsd') { const entry = boxHeader(b, body + 8, p + box.size); if (entry) info.entry = entry.type }
      else if (box.type === 'stco' || box.type === 'co64') {
        const count = u32be(b, body + 4)
        const wide = box.type === 'co64'
        info.chunks = []
        for (let i = 0; i < count; i++) {
          const at = body + 8 + i * (wide ? 8 : 4)
          info.chunks.push(wide ? u32be(b, at) * 4294967296 + u32be(b, at + 4) : u32be(b, at))
        }
      } else if (box.type === 'stsz') {
        const size = u32be(b, body + 4)
        const count = u32be(b, body + 8)
        info.sizes = []
        for (let i = 0; i < count; i++) info.sizes.push(size || u32be(b, body + 12 + i * 4))
      } else if (box.type === 'stsc') {
        const count = u32be(b, body + 4)
        info.stsc = []
        for (let i = 0; i < count; i++) info.stsc.push({ first: u32be(b, body + 8 + i * 12), perChunk: u32be(b, body + 12 + i * 12) })
      }
      p += box.size
    }
  }

  function dataTrackSpans(info) {
    if (!info.chunks || !info.sizes || !info.stsc || !info.stsc.length) return null
    const spans = []
    let sample = 0
    for (let c = 0; c < info.chunks.length; c++) {
      let perChunk = 0
      for (const entry of info.stsc) if (entry.first <= c + 1) perChunk = entry.perChunk
      let length = 0
      for (let k = 0; k < perChunk && sample < info.sizes.length; k++) length += info.sizes[sample++]
      if (length) spans.push({ at: info.chunks[c], length })
    }
    return spans
  }

  function walkMp4(b, base, start, limit, depth, patches, found) {
    let p = start
    while (p < limit) {
      const box = boxHeader(b, p, limit)
      if (!box || p + box.size > limit) throw new Error('Damaged MP4')
      if (box.type === 'udta' || box.type === 'meta' || box.type === 'uuid') {
        noteMp4Text(b.subarray(p, p + box.size), found)
        if (box.type === 'uuid') found.add(LABEL_OTHER)
        freeBox(patches, base, b, p, box)
      } else if (box.type === 'mvhd' || box.type === 'tkhd' || box.type === 'mdhd') {
        zeroTimes(patches, base, b, p, box, found)
      } else if (box.type === 'trak' && depth === 0) {
        const info = {}
        inspectTrak(b, p + box.header, p + box.size, info)
        if (info.handler === 'meta' || DATA_TRACK_ENTRIES.has(info.entry)) {
          if (b.hasFragments) throw new UnsupportedError('Streaming-style video with a data track is not supported yet')
          const spans = dataTrackSpans(info)
          if (!spans) throw new Error('Damaged MP4')
          found.add(LABEL_TRACK)
          freeBox(patches, base, b, p, box)
          for (const span of spans) patches.push({ at: span.at, zeros: span.length })
        } else walkMp4(b, base, p + box.header, p + box.size, depth + 1, patches, found)
      } else if (MP4_CONTAINERS.has(box.type) && depth < 6) {
        walkMp4(b, base, p + box.header, p + box.size, depth + 1, patches, found)
      } else if (box.type === 'stsd') {
        blankCompressorNames(b, base, p + box.header + 8, p + box.size, patches, found)
      }
      p += box.size
    }
  }

  async function cleanMp4(file) {
    const found = new Set()
    const patches = []
    let p = 0
    const size = file.size
    let sawMoov = false
    while (p < size) {
      const head = await readRange(file, p, Math.min(size, p + 32))
      if (head.length < 8) throw new Error('Damaged MP4')
      const size32 = u32be(head, 0)
      const realBox = { type: ascii(head, 4, 4), header: 8, size: size32 }
      if (size32 === 1) {
        if (head.length < 16) throw new Error('Damaged MP4')
        realBox.size = u32be(head, 8) * 4294967296 + u32be(head, 12)
        realBox.header = 16
      } else if (size32 === 0) realBox.size = size - p
      if (realBox.size < realBox.header || p + realBox.size > size) throw new Error('Damaged MP4')
      if (realBox.type === 'ftyp') {
        const brand = ascii(head, realBox.header, 4)
        if (HEIF_BRANDS.has(brand)) throw new UnsupportedError('HEIC and AVIF photos are not supported yet')
      }
      if (realBox.type === 'moov') {
        if (realBox.size > MAX_MOOV_BYTES) throw new UnsupportedError('Video index is too large')
        const moov = await readRange(file, p, p + realBox.size)
        moov.hasFragments = includesAscii(moov, 'mvex')
        walkMp4(moov, p, realBox.header, realBox.size, 0, patches, found)
        sawMoov = true
      } else if (!MP4_TOP_KEEP.has(realBox.type)) {
        const sample = await readRange(file, p, Math.min(p + realBox.size, p + 4 * 1024 * 1024))
        noteMp4Text(sample, found)
        if (realBox.type !== 'meta' && realBox.type !== 'udta') found.add(LABEL_OTHER)
        const out = new Uint8Array(realBox.header)
        out.set(head.subarray(0, realBox.header))
        out.set(asciiBytes('free'), 4)
        patches.push({ at: p, bytes: out })
        if (realBox.size > realBox.header) patches.push({ at: p + realBox.header, zeros: realBox.size - realBox.header })
      }
      p += realBox.size
    }
    if (!sawMoov) throw new Error('Damaged MP4')
    patches.sort((x, y) => x.at - y.at)
    const parts = []
    let cursor = 0
    for (const patch of patches) {
      if (patch.at < cursor) continue
      parts.push(file.slice(cursor, patch.at))
      const length = patch.bytes ? patch.bytes.length : patch.zeros
      if (patch.bytes) parts.push(patch.bytes)
      else {
        let left = patch.zeros
        while (left > 0) { const n = Math.min(left, CRC_CHUNK); parts.push(new Uint8Array(n)); left -= n }
      }
      cursor = patch.at + length
    }
    parts.push(file.slice(cursor))
    return { found, location: null, output: new Blob(parts, { type: file.type || 'video/mp4' }) }
  }

  function noteId3(tag, found) {
    if (includesAscii(tag, 'TIT2') || includesAscii(tag, 'TPE1') || includesAscii(tag, 'TALB') || includesAscii(tag, 'TT2') || includesAscii(tag, 'TP1')) found.add(LABEL_TAGS)
    if (includesAscii(tag, 'APIC') || includesAscii(tag, 'PIC')) found.add(LABEL_COVER)
    if (includesAscii(tag, 'COMM') || includesAscii(tag, 'USLT')) found.add(LABEL_COMMENTS)
    if (includesAscii(tag, 'TDRC') || includesAscii(tag, 'TYER') || includesAscii(tag, 'TDAT') || includesAscii(tag, 'TDEN')) found.add(LABEL_DATE)
    if (includesAscii(tag, 'TENC') || includesAscii(tag, 'TSSE')) found.add(LABEL_SOFTWARE)
    if (includesAscii(tag, 'PRIV') || includesAscii(tag, 'GEOB') || includesAscii(tag, 'TXXX') || includesAscii(tag, 'UFID') || includesAscii(tag, 'WXXX')) found.add(LABEL_OTHER)
    if (!found.size) found.add(LABEL_TAGS)
  }

  async function skipId3(file, start, found) {
    let p = start
    for (;;) {
      const head = await readRange(file, p, p + 10)
      if (head.length < 10 || ascii(head, 0, 3) !== 'ID3') return p
      const length = 10 + syncsafe(head, 6) + ((head[5] & 0x10) ? 10 : 0)
      noteId3(await readRange(file, p, Math.min(p + length, p + 1024 * 1024)), found)
      p += length
    }
  }

  async function trimEndTags(file, end, found) {
    let e = end
    for (let guard = 0; guard < 4; guard++) {
      if (e >= 128) {
        const tail = await readRange(file, e - 128, e)
        if (ascii(tail, 0, 3) === 'TAG') {
          found.add(LABEL_TAGS)
          e -= 128
          if (e >= 227) {
            const ext = await readRange(file, e - 227, e - 223)
            if (ascii(ext, 0, 4) === 'TAG+') e -= 227
          }
          continue
        }
      }
      if (e >= 32) {
        const foot = await readRange(file, e - 32, e)
        if (ascii(foot, 0, 8) === 'APETAGEX') {
          found.add(LABEL_TAGS)
          const tagSize = u32le(foot, 12)
          const hasHeader = (foot[23] & 0x80) !== 0
          e -= tagSize + (hasHeader ? 32 : 0)
          if (e < 0) throw new Error('Damaged tags')
          continue
        }
      }
      break
    }
    return e
  }

  async function cleanMp3(file) {
    const found = new Set()
    const start = await skipId3(file, 0, found)
    const end = await trimEndTags(file, file.size, found)
    if (end <= start) throw new Error('No audio found')
    return { found, location: null, output: new Blob([file.slice(start, end)], { type: 'audio/mpeg' }) }
  }

  async function cleanWav(file) {
    const found = new Set()
    const head = await readRange(file, 0, 12)
    if (u32le(head, 4) === 0xffffffff) throw new UnsupportedError('WAV files over 4 GB are not supported')
    const parts = []
    let total = 4
    let p = 12
    let sawData = false
    while (p + 8 <= file.size) {
      const h = await readRange(file, p, p + 8)
      const type = ascii(h, 0, 4)
      const declared = u32le(h, 4)
      const available = file.size - p - 8
      if (declared > available && type !== 'data') throw new Error('Damaged WAV')
      const len = Math.min(declared, available)
      const end = p + 8 + declared + (declared & 1)
      if (WAV_KEEP.has(type)) {
        const header = new Uint8Array(8)
        header.set(h)
        putU32le(header, 4, len)
        parts.push(header, file.slice(p + 8, p + 8 + len))
        total += 8 + len
        if (len & 1) { parts.push(new Uint8Array(1)); total += 1 }
        if (type === 'data') sawData = true
      } else {
        const sample = await readRange(file, p + 8, Math.min(p + 8 + len, p + 8 + 1024 * 1024))
        if (type === 'LIST') {
          if (includesAscii(sample, 'INAM') || includesAscii(sample, 'IART') || includesAscii(sample, 'IPRD')) found.add(LABEL_TAGS)
          if (includesAscii(sample, 'ICMT')) found.add(LABEL_COMMENTS)
          if (includesAscii(sample, 'ICRD')) found.add(LABEL_DATE)
          if (includesAscii(sample, 'ISFT')) found.add(LABEL_SOFTWARE)
          if (includesAscii(sample, 'IENG') || includesAscii(sample, 'ICOP')) found.add(LABEL_AUTHOR)
          if (!found.size) found.add(LABEL_OTHER)
        } else if (type === 'bext') {
          found.add(LABEL_DATE)
          found.add(LABEL_AUTHOR)
        } else if (type === 'id3 ' || type === 'ID3 ') noteId3(sample, found)
        else if (type === '_PMX') noteXmp(sample, found)
        else if (type !== 'JUNK' && type !== 'PAD ' && type !== 'pad ') found.add(LABEL_OTHER)
      }
      p = end
    }
    if (!sawData) throw new Error('No audio found')
    const header = new Uint8Array(12)
    header.set(asciiBytes('RIFF'), 0)
    putU32le(header, 4, total)
    header.set(asciiBytes('WAVE'), 8)
    return { found, location: null, output: new Blob([header, ...parts], { type: 'audio/wav' }) }
  }

  async function cleanFlac(file) {
    const found = new Set()
    const start = await skipId3(file, 0, found)
    const magic = await readRange(file, start, start + 4)
    if (ascii(magic, 0, 4) !== 'fLaC') throw new Error('Damaged FLAC')
    const patches = []
    let p = start + 4
    for (;;) {
      const h = await readRange(file, p, p + 4)
      if (h.length < 4) throw new Error('Damaged FLAC')
      const last = (h[0] & 0x80) !== 0
      const type = h[0] & 0x7f
      const len = u24be(h, 1)
      if (type === 4 || type === 6 || type === 2) {
        if (type === 4) {
          const comments = await readRange(file, p + 4, p + 4 + Math.min(len, 1024 * 1024))
          const text = new TextDecoder().decode(comments).toUpperCase()
          if (/TITLE=|ARTIST=|ALBUM=/.test(text)) found.add(LABEL_TAGS)
          if (/DATE=|YEAR=/.test(text)) found.add(LABEL_DATE)
          if (/COMMENT=|DESCRIPTION=/.test(text)) found.add(LABEL_COMMENTS)
          if (/ENCODED|ENCODER/.test(text)) found.add(LABEL_SOFTWARE)
          if (!found.size) found.add(LABEL_OTHER)
        } else found.add(type === 6 ? LABEL_COVER : LABEL_OTHER)
        const out = new Uint8Array(4 + len)
        out[0] = (last ? 0x80 : 0) | 1
        out[1] = h[1]; out[2] = h[2]; out[3] = h[3]
        patches.push({ at: p, bytes: out })
      }
      p += 4 + len
      if (last) break
      if (p > file.size) throw new Error('Damaged FLAC')
    }
    const end = await trimEndTags(file, file.size, found)
    const parts = []
    let cursor = start
    for (const patch of patches) {
      parts.push(file.slice(cursor, patch.at))
      parts.push(patch.bytes)
      cursor = patch.at + patch.bytes.length
    }
    parts.push(file.slice(cursor, end))
    return { found, location: null, output: new Blob(parts, { type: 'audio/flac' }) }
  }

  async function ftypBrands(file) {
    const h = await readRange(file, 0, 8)
    const size = Math.min(u32be(h, 0), 256)
    const box = await readRange(file, 0, size)
    const brands = new Set([ascii(box, 8, 4)])
    for (let p = 16; p + 4 <= box.length; p += 4) brands.add(ascii(box, p, 4))
    return brands
  }

  async function detect(file) {
    const h = await readRange(file, 0, 16)
    if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return KIND_JPEG
    if (h[0] === 0x89 && ascii(h, 1, 3) === 'PNG') return KIND_PNG
    if (ascii(h, 0, 4) === 'RIFF' && ascii(h, 8, 4) === 'WEBP') return KIND_WEBP
    if (ascii(h, 0, 4) === 'RIFF' && ascii(h, 8, 4) === 'WAVE') return KIND_WAV
    if (ascii(h, 4, 4) === 'ftyp') {
      const brands = await ftypBrands(file)
      const major = ascii(h, 8, 4)
      if (HEIF_BRANDS.has(major) || (!['isom', 'iso2', 'mp41', 'mp42', 'qt  ', 'M4A ', 'M4V ', 'M4B ', 'avc1', '3gp4', '3gp5', 'dash'].includes(major) && [...brands].some((b) => HEIF_BRANDS.has(b)))) {
        if ([...brands].some((b) => HEIC_BRANDS.has(b))) return KIND_HEIC
        throw new UnsupportedError('AVIF and other HEIF images are not supported yet')
      }
      return KIND_MP4
    }
    if (ascii(h, 0, 4) === 'fLaC') return KIND_FLAC
    if (ascii(h, 0, 3) === 'ID3') {
      const length = 10 + syncsafe(h, 6) + ((h[5] & 0x10) ? 10 : 0)
      const after = await readRange(file, length, length + 4)
      if (ascii(after, 0, 4) === 'fLaC') return KIND_FLAC
      return KIND_MP3
    }
    if (h[0] === 0xff && (h[1] & 0xe0) === 0xe0 && /\.mp3$/i.test(file.name || '')) return KIND_MP3
    return null
  }

  function parseIinf(b, start, end) {
    const items = new Map()
    const version = b[start]
    let p = start + 4
    const count = version === 0 ? (b[p] << 8) | b[p + 1] : u32be(b, p)
    p += version === 0 ? 2 : 4
    for (let i = 0; i < count && p + 8 <= end; i++) {
      const box = boxHeader(b, p, end)
      if (!box) break
      if (box.type === 'infe') {
        const q = p + box.header
        const v = b[q]
        if (v >= 2) {
          let r = q + 4
          const id = v === 2 ? (b[r] << 8) | b[r + 1] : u32be(b, r)
          r += v === 2 ? 2 : 4
          r += 2
          const type = ascii(b, r, 4)
          r += 4
          while (r < p + box.size && b[r] !== 0) r++
          r++
          let contentType = ''
          if (type === 'mime') {
            const s = r
            while (r < p + box.size && b[r] !== 0) r++
            contentType = ascii(b, s, r - s)
          }
          items.set(id, { type, contentType })
        }
      }
      p += box.size
    }
    return items
  }

  function readSized(b, p, size) {
    let v = 0
    for (let i = 0; i < size; i++) v = v * 256 + b[p + i]
    return v
  }

  function parseIloc(b, start) {
    const locations = new Map()
    const version = b[start]
    let p = start + 4
    const offsetSize = b[p] >> 4
    const lengthSize = b[p] & 15
    const baseSize = b[p + 1] >> 4
    const indexSize = version === 1 || version === 2 ? b[p + 1] & 15 : 0
    p += 2
    const count = version < 2 ? (b[p] << 8) | b[p + 1] : u32be(b, p)
    p += version < 2 ? 2 : 4
    for (let i = 0; i < count; i++) {
      const id = version < 2 ? (b[p] << 8) | b[p + 1] : u32be(b, p)
      p += version < 2 ? 2 : 4
      let method = 0
      if (version === 1 || version === 2) { method = b[p + 1] & 15; p += 2 }
      p += 2
      const base = readSized(b, p, baseSize)
      p += baseSize
      const extentCount = (b[p] << 8) | b[p + 1]
      p += 2
      const extents = []
      for (let e = 0; e < extentCount; e++) {
        p += indexSize
        const offset = readSized(b, p, offsetSize)
        p += offsetSize
        const length = readSized(b, p, lengthSize)
        p += lengthSize
        extents.push({ offset: base + offset, length })
      }
      locations.set(id, { method, extents })
    }
    return locations
  }

  async function cleanHeic(file) {
    const found = new Set()
    const state = { orientation: 1, location: null }
    let p = 0
    let meta = null
    while (p < file.size) {
      const head = await readRange(file, p, Math.min(file.size, p + 16))
      if (head.length < 8) throw new Error('Damaged HEIC')
      let size = u32be(head, 0)
      let header = 8
      if (size === 1) { size = u32be(head, 8) * 4294967296 + u32be(head, 12); header = 16 }
      else if (size === 0) size = file.size - p
      if (size < header || p + size > file.size) throw new Error('Damaged HEIC')
      if (ascii(head, 4, 4) === 'meta') {
        if (size > MAX_MOOV_BYTES) throw new UnsupportedError('Image index is too large')
        meta = { at: p, header, size, bytes: await readRange(file, p, p + size) }
      }
      p += size
    }
    if (!meta) throw new Error('Damaged HEIC')
    const b = meta.bytes
    let items = null
    let locations = null
    let idatStart = -1
    let q = meta.header + 4
    while (q < meta.size) {
      const box = boxHeader(b, q, meta.size)
      if (!box || q + box.size > meta.size) throw new Error('Damaged HEIC')
      if (box.type === 'iinf') items = parseIinf(b, q + box.header, q + box.size)
      else if (box.type === 'iloc') locations = parseIloc(b, q + box.header)
      else if (box.type === 'idat') idatStart = meta.at + q + box.header
      q += box.size
    }
    if (!items || !locations) throw new Error('Damaged HEIC')
    const patches = []
    for (const [id, item] of items) {
      const isExif = item.type === 'Exif'
      const isXmp = item.type === 'mime' && /rdf\+xml|xmp/i.test(item.contentType)
      if (!isExif && !isXmp) continue
      const location = locations.get(id)
      if (!location) continue
      const spans = []
      let total = 0
      for (const extent of location.extents) {
        let at = extent.offset
        if (location.method === 1) {
          if (idatStart < 0) throw new Error('Damaged HEIC')
          at += idatStart
        } else if (location.method !== 0) throw new UnsupportedError('This HEIC layout is not supported yet')
        const length = extent.length || file.size - at
        if (at + length > file.size) throw new Error('Damaged HEIC')
        spans.push({ at, length })
        total += length
      }
      const data = new Uint8Array(total)
      let w = 0
      for (const span of spans) { data.set(await readRange(file, span.at, span.at + span.length), w); w += span.length }
      const replacement = new Uint8Array(total)
      if (isExif) {
        const offset = total >= 4 ? u32be(data, 0) : 0
        if (4 + offset < total) readTiff(data.subarray(4 + offset), found, state)
        if (!found.size) found.add(LABEL_DEVICE)
        if (total >= 18) replacement.set([0, 0, 0, 0, 0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
      } else {
        noteXmp(data, found)
        replacement.fill(0x20)
        if (total >= XMP_PLACEHOLDER.length) replacement.set(asciiBytes(XMP_PLACEHOLDER))
      }
      let r = 0
      for (const span of spans) { patches.push({ at: span.at, bytes: replacement.subarray(r, r + span.length) }); r += span.length }
    }
    patches.sort((x, y) => x.at - y.at)
    const parts = []
    let cursor = 0
    for (const patch of patches) {
      if (patch.at < cursor) throw new Error('Damaged HEIC')
      parts.push(file.slice(cursor, patch.at), patch.bytes)
      cursor = patch.at + patch.bytes.length
    }
    parts.push(file.slice(cursor))
    return { found, location: state.location, output: new Blob(parts, { type: 'image/heic' }) }
  }

  const CLEANERS = new Map([[KIND_HEIC, cleanHeic], [KIND_JPEG, cleanJpeg], [KIND_PNG, cleanPng], [KIND_WEBP, cleanWebp], [KIND_MP4, cleanMp4], [KIND_MP3, cleanMp3], [KIND_WAV, cleanWav], [KIND_FLAC, cleanFlac]])

  async function clean(file) {
    let kind = null
    try {
      kind = await detect(file)
      if (!kind) return { kind: null, skipped: 'Not a supported file type' }
      const result = await CLEANERS.get(kind)(file)
      return { kind, found: [...result.found], location: result.location, output: result.output }
    } catch (e) {
      return { kind, skipped: e instanceof UnsupportedError ? e.message : 'Could not be read safely, so it was left out' }
    }
  }

  let crcTable = null
  function crcTableGet() {
    if (crcTable) return crcTable
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
    return crcTable
  }

  async function crc32(blob) {
    const table = crcTableGet()
    let crc = 0xffffffff
    for (let p = 0; p < blob.size; p += CRC_CHUNK) {
      const bytes = new Uint8Array(await blob.slice(p, p + CRC_CHUNK).arrayBuffer())
      for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
    }
    return (crc ^ 0xffffffff) >>> 0
  }

  async function zip(entries, onProgress) {
    if (entries.length > ZIP_MAX_ENTRIES) throw new Error('Too many files for one zip. Save to a folder instead.')
    const total = entries.reduce((sum, e) => sum + e.blob.size, 0)
    if (total > ZIP_MAX_BYTES) throw new Error('More than 4 GB in total. Save to a folder instead, or choose fewer files.')
    const encoder = new TextEncoder()
    const parts = []
    const central = []
    let offset = 0
    for (let i = 0; i < entries.length; i++) {
      const name = encoder.encode(entries[i].name)
      const blob = entries[i].blob
      const crc = await crc32(blob)
      const local = new Uint8Array(30 + name.length)
      putU32le(local, 0, 0x04034b50)
      putU16le(local, 4, 20); putU16le(local, 6, 0x0800); putU16le(local, 8, 0)
      putU16le(local, 10, 0); putU16le(local, 12, 0x21)
      putU32le(local, 14, crc); putU32le(local, 18, blob.size); putU32le(local, 22, blob.size)
      putU16le(local, 26, name.length); putU16le(local, 28, 0)
      local.set(name, 30)
      const entry = new Uint8Array(46 + name.length)
      putU32le(entry, 0, 0x02014b50)
      putU16le(entry, 4, 20); putU16le(entry, 6, 20); putU16le(entry, 8, 0x0800); putU16le(entry, 10, 0)
      putU16le(entry, 12, 0); putU16le(entry, 14, 0x21)
      putU32le(entry, 16, crc); putU32le(entry, 20, blob.size); putU32le(entry, 24, blob.size)
      putU16le(entry, 28, name.length)
      putU32le(entry, 42, offset)
      entry.set(name, 46)
      parts.push(local, blob)
      central.push(entry)
      offset += local.length + blob.size
      if (onProgress) onProgress(i + 1, entries.length)
    }
    const centralSize = central.reduce((sum, e) => sum + e.length, 0)
    const end = new Uint8Array(22)
    putU32le(end, 0, 0x06054b50)
    putU16le(end, 8, entries.length); putU16le(end, 10, entries.length)
    putU32le(end, 12, centralSize); putU32le(end, 16, offset)
    return new Blob([...parts, ...central, end], { type: 'application/zip' })
  }

  globalThis.ValidMetadataRemoval = { clean, zip, detect }
})()
