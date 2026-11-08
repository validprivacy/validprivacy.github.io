(() => {
  const api = globalThis.ValidMetadataRemoval
  const MAX_ROWS = 400
  const ZIP_NAME = 'metadata-removed.zip'
  const SYSTEM_FILES = new Set(['thumbs.db', 'desktop.ini', '.ds_store'])
  const LABEL_LOCATION = 'Location (GPS)'

  const el = (id) => document.getElementById(id)
  const drop = el('mr-drop')
  const filesInput = el('mr-files')
  const folderInput = el('mr-folder')
  const status = el('mr-status')
  const summary = el('mr-summary')
  const results = el('mr-results')
  const saveRow = el('mr-save-row')
  const saveFolder = el('mr-save-folder')
  const saveDownload = el('mr-save-download')
  const rename = el('mr-rename')

  let items = []
  let busy = false

  if (!('showDirectoryPicker' in window)) saveFolder.hidden = true

  function setStatus(text) {
    status.hidden = !text
    status.textContent = text || ''
  }

  function extensionOf(name) {
    const dot = name.lastIndexOf('.')
    return dot > 0 ? name.slice(dot).toLowerCase() : ''
  }

  function outputPaths() {
    const counters = new Map()
    return items.filter((item) => item.output).map((item) => {
      if (!rename.checked) return { path: item.path, blob: item.output }
      const slash = item.path.lastIndexOf('/')
      const folder = slash >= 0 ? item.path.slice(0, slash + 1) : ''
      const next = (counters.get(folder) || 0) + 1
      counters.set(folder, next)
      return { path: folder + 'file-' + String(next).padStart(3, '0') + extensionOf(item.path), blob: item.output }
    })
  }

  function cell(text, cls) {
    const td = document.createElement('td')
    if (cls) td.className = cls
    td.textContent = text
    return td
  }

  function describe(item) {
    if (item.skipped) return 'Left out: ' + item.skipped
    if (!item.found.length) return 'Nothing found. A clean copy is still included.'
    return item.found.map((label) => {
      if (label === LABEL_LOCATION && item.location) return label + ' ' + item.location.lat.toFixed(5) + ', ' + item.location.lon.toFixed(5)
      return label
    }).join(' · ')
  }

  function render() {
    const cleaned = items.filter((item) => item.output)
    const skipped = items.length - cleaned.length
    const counts = new Map()
    for (const item of cleaned) for (const label of item.found) counts.set(label, (counts.get(label) || 0) + 1)
    summary.replaceChildren()
    const head = document.createElement('p')
    head.className = 'mr-summary-head'
    head.textContent = cleaned.length + (cleaned.length === 1 ? ' file ready' : ' files ready') + (skipped ? ', ' + skipped + ' left out' : '') + '.'
    summary.append(head)
    if (counts.size) {
      const list = document.createElement('ul')
      list.className = 'mr-counts'
      for (const [label, count] of [...counts].sort((a, b) => b[1] - a[1])) {
        const li = document.createElement('li')
        const strong = document.createElement('strong')
        strong.textContent = label
        li.append(strong, document.createTextNode(' found in ' + count + (count === 1 ? ' file' : ' files')))
        list.append(li)
      }
      summary.append(list)
    } else if (cleaned.length) {
      const none = document.createElement('p')
      none.textContent = 'No hidden data was found in these files.'
      summary.append(none)
    }
    summary.hidden = false
    const table = document.createElement('table')
    const thead = document.createElement('thead')
    const hr = document.createElement('tr')
    hr.append(cell('File'), cell('Type'), cell('What was found'))
    thead.append(hr)
    const tbody = document.createElement('tbody')
    for (const item of items.slice(0, MAX_ROWS)) {
      const tr = document.createElement('tr')
      if (item.skipped) tr.className = 'mr-skipped'
      tr.append(cell(item.path, 'mr-name'), cell(item.kind || 'Unknown'), cell(describe(item)))
      tbody.append(tr)
    }
    table.append(thead, tbody)
    results.replaceChildren(table)
    if (items.length > MAX_ROWS) {
      const more = document.createElement('p')
      more.className = 'mr-fine'
      more.textContent = 'And ' + (items.length - MAX_ROWS) + ' more files.'
      results.append(more)
    }
    results.hidden = false
    saveRow.hidden = cleaned.length === 0
    saveDownload.textContent = cleaned.length === 1 ? 'Download clean file' : 'Download as zip'
  }

  async function process(list) {
    if (busy || !list.length) return
    list.sort((x, y) => x.path.localeCompare(y.path))
    busy = true
    items = []
    saveRow.hidden = true
    results.hidden = true
    summary.hidden = true
    for (let i = 0; i < list.length; i++) {
      const { file, path } = list[i]
      setStatus('Checking ' + (i + 1) + ' of ' + list.length + ': ' + path)
      if (SYSTEM_FILES.has(file.name.toLowerCase()) || file.name.startsWith('.')) {
        items.push({ path, kind: null, skipped: 'System file' })
        continue
      }
      const result = await api.clean(file)
      items.push({ path, ...result })
    }
    setStatus('')
    render()
    busy = false
  }

  function fromInput(input) {
    return [...input.files].map((file) => ({ file, path: file.webkitRelativePath || file.name }))
  }

  function readAll(reader) {
    return new Promise((resolve, reject) => {
      const all = []
      const next = () => reader.readEntries((batch) => {
        if (!batch.length) resolve(all)
        else { all.push(...batch); next() }
      }, reject)
      next()
    })
  }

  async function walk(entry, out) {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject))
      out.push({ file, path: entry.fullPath.replace(/^\//, '') })
    } else if (entry.isDirectory) {
      for (const child of await readAll(entry.createReader())) await walk(child, out)
    }
  }

  async function fromDrop(dataTransfer) {
    const entries = [...dataTransfer.items].map((item) => item.webkitGetAsEntry ? item.webkitGetAsEntry() : null)
    if (entries.some((entry) => !entry)) return [...dataTransfer.files].map((file) => ({ file, path: file.name }))
    const out = []
    for (const entry of entries) await walk(entry, out)
    return out
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  el('mr-pick-files').addEventListener('click', () => filesInput.click())
  el('mr-pick-folder').addEventListener('click', () => folderInput.click())
  filesInput.addEventListener('change', () => { process(fromInput(filesInput)); filesInput.value = '' })
  folderInput.addEventListener('change', () => { process(fromInput(folderInput)); folderInput.value = '' })

  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over') })
  drop.addEventListener('dragleave', () => drop.classList.remove('over'))
  drop.addEventListener('drop', async (e) => {
    e.preventDefault()
    drop.classList.remove('over')
    process(await fromDrop(e.dataTransfer))
  })

  saveDownload.addEventListener('click', async () => {
    const outputs = outputPaths()
    if (!outputs.length) return
    try {
      if (outputs.length === 1) {
        const path = outputs[0].path
        download(outputs[0].blob, path.slice(path.lastIndexOf('/') + 1))
        return
      }
      setStatus('Building the zip')
      const zip = await api.zip(outputs.map((o) => ({ name: o.path, blob: o.blob })), (done, total) => setStatus('Building the zip: ' + done + ' of ' + total))
      setStatus('')
      download(zip, ZIP_NAME)
    } catch (e) {
      setStatus(e.message)
    }
  })

  saveFolder.addEventListener('click', async () => {
    const outputs = outputPaths()
    if (!outputs.length) return
    let root
    try { root = await window.showDirectoryPicker({ mode: 'readwrite' }) } catch (e) { return }
    try {
      for (let i = 0; i < outputs.length; i++) {
        setStatus('Saving ' + (i + 1) + ' of ' + outputs.length)
        const segments = outputs[i].path.split('/')
        const name = segments.pop()
        let dir = root
        for (const segment of segments) if (segment) dir = await dir.getDirectoryHandle(segment, { create: true })
        const handle = await dir.getFileHandle(name, { create: true })
        const writable = await handle.createWritable()
        await writable.write(outputs[i].blob)
        await writable.close()
      }
      setStatus('Saved ' + outputs.length + (outputs.length === 1 ? ' clean file.' : ' clean files.'))
    } catch (e) {
      setStatus('Saving stopped: ' + e.message)
    }
  })

  el('mr-reset').addEventListener('click', () => {
    items = []
    saveRow.hidden = true
    results.hidden = true
    summary.hidden = true
    setStatus('')
  })
})()
