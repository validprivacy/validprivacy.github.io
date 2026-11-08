(() => {
  const root = document.querySelector('.carousel')
  if (!root) return
  const slides = [...root.querySelectorAll('.slide')]
  const nav = root.querySelector('.carousel-nav')
  const dotsBox = root.querySelector('.carousel-dots')
  const toggle = root.querySelector('.carousel-toggle')
  if (slides.length < 2 || !nav || !dotsBox || !toggle) return

  const SLIDE_MS = 7000
  const TOUCH_RESUME_MS = 10000
  const SWIPE_PX = 50
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  let index = 0
  let userPaused = reduceMotion.matches
  let hovering = false
  let focused = false
  let touchHold = false
  let touchTimer = 0
  let touchStartX = null
  let touchStartY = null

  root.style.setProperty('--slide-ms', SLIDE_MS + 'ms')
  for (const slide of slides) slide.hidden = false

  const dots = slides.map((slide, i) => {
    const dot = document.createElement('button')
    dot.type = 'button'
    dot.className = 'carousel-dot'
    const label = (slide.getAttribute('aria-label') || '').replace(/^\d+ of \d+: /, '')
    dot.setAttribute('aria-label', 'Slide ' + (i + 1) + ': ' + label)
    const fill = document.createElement('span')
    fill.className = 'carousel-fill'
    fill.addEventListener('animationend', () => { if (i === index && !isPaused()) go(index + 1) })
    dot.append(fill)
    dot.addEventListener('click', () => go(i))
    dotsBox.append(dot)
    return dot
  })

  function isPaused() {
    return userPaused || hovering || focused || touchHold || document.hidden
  }

  function sync() {
    const paused = isPaused()
    root.classList.toggle('is-paused', paused)
    root.classList.toggle('is-stopped', userPaused)
    toggle.setAttribute('aria-label', userPaused ? 'Play slides' : 'Pause slides')
    toggle.setAttribute('aria-pressed', String(userPaused))
  }

  function warm(slide) {
    if (reduceMotion.matches) return
    for (const img of slide.querySelectorAll('img[data-motion-src]')) {
      img.src = img.dataset.motionSrc
      img.removeAttribute('data-motion-src')
    }
  }

  function go(next) {
    index = (next + slides.length) % slides.length
    slides.forEach((slide, i) => {
      const active = i === index
      slide.classList.toggle('is-active', active)
      slide.setAttribute('aria-hidden', String(!active))
      slide.inert = !active
    })
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === index)
      if (i === index) dot.setAttribute('aria-current', 'true')
      else dot.removeAttribute('aria-current')
      const fill = dot.firstChild
      fill.style.animation = 'none'
      void fill.offsetWidth
      fill.style.animation = ''
    })
    warm(slides[index])
    warm(slides[(index + 1) % slides.length])
    sync()
  }

  for (const button of root.querySelectorAll('.carousel-step')) {
    button.addEventListener('click', () => go(index + Number(button.dataset.step)))
  }

  toggle.addEventListener('click', () => { userPaused = !userPaused; sync() })

  root.addEventListener('mouseenter', () => { hovering = true; sync() })
  root.addEventListener('mouseleave', () => { hovering = false; sync() })
  root.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) { focused = true; sync() } })
  root.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget)) { focused = false; sync() } })

  root.addEventListener('touchstart', (e) => {
    touchHold = true
    clearTimeout(touchTimer)
    touchStartX = e.touches[0].clientX
    touchStartY = e.touches[0].clientY
    sync()
  }, { passive: true })

  root.addEventListener('touchend', (e) => {
    if (touchStartX !== null) {
      const dx = e.changedTouches[0].clientX - touchStartX
      const dy = e.changedTouches[0].clientY - touchStartY
      if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1))
    }
    touchStartX = null
    clearTimeout(touchTimer)
    touchTimer = setTimeout(() => { touchHold = false; sync() }, TOUCH_RESUME_MS)
  }, { passive: true })

  root.addEventListener('keydown', (e) => {
    if (e.target.closest('a, input, textarea')) return
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1) }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1) }
  })

  document.addEventListener('visibilitychange', sync)
  reduceMotion.addEventListener('change', () => { if (reduceMotion.matches) userPaused = true; sync() })

  nav.hidden = false
  root.classList.add('is-ready')
  go(0)
})()
