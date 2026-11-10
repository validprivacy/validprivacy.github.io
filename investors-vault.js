(() => {
  const $ = (id) => document.getElementById('vv-' + id)
  const YEARS = 5
  const MONTHS = YEARS * 12
  const FUND_MIN = 2000
  const FUND_MAX = 5000000
  const FUND_STEPS = 1000
  const TYPES = [
    { key: 's', label: 'Small offices', work: 0.25 },
    { key: 'm', label: 'Mid-size', work: 1 },
    { key: 'l', label: 'Large and regulated', work: 3 },
  ]
  const FIELDS = [
    { id: 'ask', group: 'g-deal', label: 'Funding amount', hint: 'Or drag the funding slider at the top', min: 2000, max: 5000000, step: 1000, value: 1000000, unit: '$' },
    { id: 'cap', group: 'g-deal', label: 'Post-money valuation cap', hint: 'Set with the investor', min: 500000, max: 50000000, step: 250000, value: 8000000, unit: '$' },
    { id: 'price', group: 'g-market', label: 'Price per user per month', hint: 'Billed yearly', min: 1, max: 20, step: 0.5, value: 6, unit: '$' },
    { id: 'setup', group: 'g-market', label: 'Setup fee per new customer', hint: 'One-time: intake, config, first deployment', min: 0, max: 25000, step: 1, value: 999, unit: '$' },
    { id: 'churn', group: 'g-market', label: 'Customers who cancel each year', hint: '', min: 0, max: 40, step: 1, value: 10, unit: '%' },
    { id: 'sSeats', group: 'g-small', label: 'Users per customer', hint: 'Law offices, clinics, small firms', min: 1, max: 100, step: 1, value: 25, unit: '' },
    { id: 'sNew', group: 'g-small', label: 'New customers in year 1', hint: '', min: 0, max: 500, step: 1, value: 4, unit: '' },
    { id: 'sGrow', group: 'g-small', label: 'Growth in new customers each year', hint: '', min: 0, max: 300, step: 5, value: 60, unit: '%' },
    { id: 'mSeats', group: 'g-mid', label: 'Users per customer', hint: 'Hospitals, regional banks, credit unions', min: 50, max: 1000, step: 10, value: 250, unit: '' },
    { id: 'mNew', group: 'g-mid', label: 'New customers in year 1', hint: '', min: 0, max: 500, step: 1, value: 3, unit: '' },
    { id: 'mGrow', group: 'g-mid', label: 'Growth in new customers each year', hint: '', min: 0, max: 300, step: 5, value: 60, unit: '%' },
    { id: 'lSeats', group: 'g-large', label: 'Users per customer', hint: 'Defense contractors, utilities, government', min: 500, max: 20000, step: 100, value: 1000, unit: '' },
    { id: 'lNew', group: 'g-large', label: 'New customers in year 1', hint: '', min: 0, max: 200, step: 1, value: 1, unit: '' },
    { id: 'lGrow', group: 'g-large', label: 'Growth in new customers each year', hint: '', min: 0, max: 300, step: 5, value: 80, unit: '%' },
    { id: 'founder', group: 'g-team', label: 'Founder salary', hint: 'Software developer median is $135,980 (BLS)', min: 0, max: 300000, step: 1000, value: 135000, unit: '$' },
    { id: 'founderCloses', group: 'g-team', label: 'Sales work the founder covers per year', hint: 'In mid-size deals. A large deal counts as 3, a small one as a quarter', min: 0, max: 50, step: 1, value: 6, unit: '' },
    { id: 'repSalary', group: 'g-team', label: 'Salesperson cost per year', hint: 'Base plus commission', min: 0, max: 300000, step: 1000, value: 100000, unit: '$' },
    { id: 'repCloses', group: 'g-team', label: 'Sales work per salesperson per year', hint: 'In mid-size deals', min: 1, max: 200, step: 1, value: 24, unit: '' },
    { id: 'engSalary', group: 'g-team', label: 'Engineer salary', hint: '', min: 0, max: 300000, step: 1000, value: 120000, unit: '$' },
    { id: 'eng1', group: 'g-team', label: 'Engineers in year 1', hint: '', min: 0, max: 50, step: 1, value: 1, unit: '' },
    { id: 'engAdd', group: 'g-team', label: 'Engineers added each year', hint: '', min: 0, max: 50, step: 1, value: 1, unit: '' },
    { id: 'supSalary', group: 'g-team', label: 'Support staff salary', hint: '', min: 0, max: 200000, step: 1000, value: 60000, unit: '$' },
    { id: 'perSupport', group: 'g-team', label: 'Customers per support person', hint: 'In mid-size customers. A large one counts as 3, a small one as a quarter', min: 1, max: 500, step: 1, value: 40, unit: '' },
    { id: 'burden', group: 'g-team', label: 'Employer costs on top of salaries', hint: 'Payroll taxes, benefits', min: 0, max: 50, step: 1, value: 20, unit: '%' },
    { id: 'running', group: 'g-other', label: 'Running costs per year', hint: 'Accounting, insurance, legal, office', min: 0, max: 500000, step: 500, value: 25000, unit: '$' },
    { id: 'otherPct', group: 'g-other', label: 'Marketing and sales costs', hint: 'Share of revenue: travel, events, ads', min: 0, max: 50, step: 1, value: 15, unit: '%' },
    { id: 'audit', group: 'g-other', label: 'Independent security audit', hint: 'One-time, year 1', min: 0, max: 300000, step: 1000, value: 50000, unit: '$' },
    { id: 'multiple', group: 'g-other', label: 'Company value as a multiple of ARR', hint: 'For the investor outcome. Set from comparable deals', min: 1, max: 30, step: 0.5, value: 6, unit: 'x' },
  ]
  const state = {}
  const money = (n) => (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US')
  const short = (n) => {
    const a = Math.abs(n), sign = n < 0 ? '-' : ''
    if (a >= 1000000) return sign + '$' + (a / 1000000).toFixed(a >= 10000000 ? 1 : 2).replace(/\.?0+$/, '') + 'M'
    if (a >= 10000) return sign + '$' + Math.round(a / 1000) + 'k'
    return money(n)
  }
  const pct = (n) => (n * 100).toFixed(1).replace(/\.0$/, '') + '%'

  function build() {
    for (const f of FIELDS) {
      state[f.id] = f.value
      const wrap = document.createElement('div')
      wrap.className = 'calc-ctl'
      const label = document.createElement('label')
      label.htmlFor = 'vv-num-' + f.id
      label.textContent = f.label
      const box = document.createElement('div')
      box.className = 'calc-num'
      if (f.unit === '$') { const e = document.createElement('em'); e.textContent = '$'; box.append(e) }
      const num = document.createElement('input')
      num.type = 'number'
      num.id = 'vv-num-' + f.id
      num.min = f.min
      num.max = f.max
      num.step = f.step
      num.inputMode = 'decimal'
      box.append(num)
      if (f.unit === '%' || f.unit === 'x') { const e = document.createElement('em'); e.textContent = f.unit; box.append(e) }
      const range = document.createElement('input')
      range.type = 'range'
      range.id = 'vv-range-' + f.id
      range.min = f.min
      range.max = f.max
      range.step = f.step
      range.setAttribute('aria-label', f.label)
      wrap.append(label, box, range)
      if (f.hint) { const hint = document.createElement('div'); hint.className = 'calc-hint'; hint.textContent = f.hint; wrap.append(hint) }
      $(f.group).append(wrap)
      range.addEventListener('input', () => set(f.id, Number(range.value), true))
      num.addEventListener('input', () => { if (num.value !== '') set(f.id, Number(num.value), true) })
      num.addEventListener('blur', () => sync(f.id))
    }
    const fund = $('fund-range')
    fund.setAttribute('aria-label', 'Funding amount')
    fund.addEventListener('input', () => { state.ask = fromSlider(Number(fund.value)); sync('ask'); render() })
    const marks = document.querySelectorAll('.calc-fund-scale span')
    const at = [2000, 50000, 500000, 5000000]
    marks.forEach((el, i) => { if (i > 0 && i < marks.length - 1) el.style.left = (toSlider(at[i]) / FUND_STEPS * 100) + '%' })
  }

  function set(id, value, manual) {
    const f = FIELDS.find((x) => x.id === id)
    state[id] = isFinite(value) ? Math.min(f.max, Math.max(f.min, value)) : f.min
    sync(id, manual)
    render()
  }

  function fromSlider(t) {
    const v = FUND_MIN * Math.pow(FUND_MAX / FUND_MIN, t / FUND_STEPS)
    const step = v < 20000 ? 500 : v < 100000 ? 1000 : v < 1000000 ? 5000 : 25000
    return Math.min(FUND_MAX, Math.max(FUND_MIN, Math.round(v / step) * step))
  }

  function toSlider(v) {
    return Math.round(Math.log(Math.max(FUND_MIN, v) / FUND_MIN) / Math.log(FUND_MAX / FUND_MIN) * FUND_STEPS)
  }

  function sync(id, typing) {
    if (id === 'ask') {
      const fund = $('fund-range')
      if (document.activeElement !== fund) fund.value = toSlider(state.ask)
      $('fund-out').textContent = money(state.ask)
    }
    const range = $('range-' + id)
    const num = $('num-' + id)
    range.value = state[id]
    if (!typing || document.activeElement !== num) num.value = state[id]
  }

  function simulate(startCash) {
    const s = state
    const keep = Math.pow(1 - s.churn / 100, 1 / 12)
    const lift = 1 + s.burden / 100
    const counts = { s: 0, m: 0, l: 0 }
    const rows = []
    let cash = startCash
    for (let m = 1; m <= MONTHS; m++) {
      const y = Math.floor((m - 1) / 12)
      let fresh = 0, work = 0, load = 0, license = 0, seats = 0, customers = 0
      for (const t of TYPES) {
        const yearly = s[t.key + 'New'] * Math.pow(1 + s[t.key + 'Grow'] / 100, y)
        const add = yearly / 12
        counts[t.key] = counts[t.key] * keep + add
        fresh += add
        work += yearly * t.work
        load += counts[t.key] * t.work
        seats += counts[t.key] * s[t.key + 'Seats']
        customers += counts[t.key]
      }
      license = seats * s.price
      const reps = Math.ceil(Math.max(0, work - s.founderCloses) / s.repCloses - 1e-9)
      const engineers = s.eng1 + s.engAdd * y
      const support = Math.max(1, Math.ceil(load / s.perSupport - 1e-9))
      const team = 1 + reps + engineers + support
      const payroll = (s.founder + reps * s.repSalary + engineers * s.engSalary + support * s.supSalary) / 12 * lift
      const revenue = license + fresh * s.setup
      const cost = payroll + s.running / 12 + revenue * s.otherPct / 100 + (m === 1 ? s.audit : 0)
      cash += revenue - cost
      rows.push({ m, y, fresh, customers, seats, team, license, revenue, cost, cash, arr: license * 12, split: { ...counts } })
    }
    return rows
  }

  function render() {
    const base = simulate(0)
    const lowRow = base.reduce((a, b) => (b.cash < a.cash ? b : a))
    const need = Math.max(0, -lowRow.cash)
    const rows = simulate(state.ask)
    const last = rows[MONTHS - 1]
    const own = state.cap > 0 ? Math.min(1, state.ask / state.cap) : 0
    const value = last.arr * state.multiple
    const stake = own * value
    const out = rows.find((r) => r.cash < 0)
    const askEl = $('ask-v')
    askEl.textContent = money(state.ask)
    askEl.style.color = out ? 'var(--c-bad)' : ''
    $('ask-s').textContent = out
      ? 'Runs out in month ' + out.m + '. This plan needs ' + money(need) + ' to reach profit. Raise more, or slow the hiring'
      : need > 0
        ? 'Covers the plan to profit, with ' + money(state.ask - need) + ' to spare at the lowest point'
        : 'Revenue covers costs from the start. All of it goes to faster growth'
    $('t-own').textContent = pct(own)
    $('t-own-s').textContent = 'founder keeps ' + pct(1 - own)
    $('t-arr').textContent = short(last.arr)
    $('t-arr-s').textContent = Math.round(last.seats).toLocaleString('en-US') + ' seats'
    $('t-ret').textContent = state.ask > 0 ? (stake / state.ask).toFixed(1) + 'x' : 'None'
    $('t-ret-s').textContent = state.ask > 0 ? short(stake) + ' stake on ' + short(state.ask) : ''
    $('need-v').textContent = money(need)
    $('need-s').textContent = need === 0 ? 'revenue covers costs from the start' : lowRow.m < MONTHS ? 'the deepest point cash reaches, month ' + lowRow.m + ', before revenue overtakes costs' : 'still short of profit at the end of year 5 with this mix'
    const posYear = [0, 1, 2, 3, 4].find((y) => rows.slice(y * 12, y * 12 + 12).reduce((t, r) => t + r.revenue - r.cost, 0) >= 0)
    $('t-pos').textContent = posYear === undefined ? 'After year 5' : 'Year ' + (posYear + 1)
    $('t-pos-s').textContent = posYear === undefined ? 'more large customers or a higher price' : 'full year with revenue above costs'
    $('t-cust').textContent = Math.round(last.customers).toLocaleString('en-US')
    $('t-cust-s').textContent = TYPES.map((t) => Math.round(last.split[t.key]) + ' ' + t.label.split(' ')[0].toLowerCase()).join(', ')
    $('t-team').textContent = last.team
    renderYears(rows)
    renderOutcome(last, own, value, stake)
    drawChart(rows)
  }

  function renderYears(rows) {
    const body = $('years')
    body.replaceChildren()
    const years = [0, 1, 2, 3, 4].map((y) => {
      const part = rows.slice(y * 12, y * 12 + 12)
      const end = part[11]
      const revenue = part.reduce((t, r) => t + r.revenue, 0)
      const cost = part.reduce((t, r) => t + r.cost, 0)
      return { signed: part.reduce((t, r) => t + r.fresh, 0), customers: end.customers, seats: end.seats, arr: end.arr, team: end.team, revenue, cost, net: revenue - cost, cash: end.cash }
    })
    const line = (label, f, strong) => {
      const tr = document.createElement('tr')
      const th = document.createElement('td'); th.textContent = label; tr.append(th)
      for (const y of years) { const td = document.createElement('td'); td.textContent = f(y); tr.append(td) }
      if (strong) tr.style.fontWeight = '600'
      body.append(tr)
    }
    const n = (v) => Math.round(v).toLocaleString('en-US')
    line('New customers', (y) => n(y.signed))
    line('Customers at year end', (y) => n(y.customers))
    line('Seats at year end', (y) => n(y.seats))
    line('ARR at year end', (y) => short(y.arr), true)
    line('Team at year end', (y) => n(y.team))
    line('Revenue', (y) => short(y.revenue))
    line('Costs', (y) => short(y.cost))
    line('Net', (y) => short(y.net), true)
    line('Cash at year end', (y) => short(y.cash))
  }

  function renderOutcome(last, own, value, stake) {
    const body = $('outcome')
    body.replaceChildren()
    const add = (a, b) => { const tr = document.createElement('tr'); const x = document.createElement('td'); x.textContent = a; const y = document.createElement('td'); y.textContent = b; tr.append(x, y); body.append(tr) }
    add('ARR at year 5', money(last.arr))
    add('Company value at ' + state.multiple + 'x ARR', money(value))
    add('Investor ownership', pct(own))
    add('Investor stake value', money(stake))
    add('Return on ' + money(state.ask), state.ask > 0 ? (stake / state.ask).toFixed(1) + 'x' : 'None')
  }

  function nice(v) {
    if (v <= 0) return 1
    const p = Math.pow(10, Math.floor(Math.log10(v)))
    for (const k of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * p >= v) return k * p
    return 10 * p
  }

  function drawChart(rows) {
    const W = 560, H = 270, L = 64, R = 16, T = 16, B = 40
    const vals = rows.flatMap((r) => [r.arr, r.cash]).concat([state.ask, 0])
    const top = Math.max(...vals), bottom = Math.min(...vals)
    const step = nice((top - bottom) / 4)
    const lo = Math.floor(bottom / step) * step
    const hi = Math.max(lo + step * 4, Math.ceil(top / step) * step)
    const X = (m) => L + (m / MONTHS) * (W - L - R)
    const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    const el = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text !== undefined) e.textContent = text; svg.append(e); return e }
    for (let v = lo; v <= hi + 1; v += step) {
      el('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: v === 0 ? 'var(--c-muted)' : 'var(--c-line)', 'stroke-width': 1 })
      el('text', { x: L - 8, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--c-muted)' }, short(v))
    }
    for (let y = 0; y <= YEARS; y++) el('text', { x: X(y * 12), y: H - B + 18, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--c-muted)' }, y === 0 ? 'Start' : 'Year ' + y)
    el('polyline', { points: [[0, state.ask]].concat(rows.map((r) => [r.m, r.cash])).map(([m, v]) => X(m) + ',' + Y(v)).join(' '), fill: 'none', stroke: 'var(--c-accent)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' })
    el('polyline', { points: [[0, 0]].concat(rows.map((r) => [r.m, r.arr])).map(([m, v]) => X(m) + ',' + Y(v)).join(' '), fill: 'none', stroke: 'var(--c-good)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' })
    $('chart').replaceChildren(svg)
  }

  build()
  for (const f of FIELDS) sync(f.id)
  render()
})()
