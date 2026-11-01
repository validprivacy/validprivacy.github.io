(() => {
  const THEME_KEY = 'valid-theme'
  const THEME_DARK = 'dark'
  const THEME_LIGHT = 'light'

  function readTheme() {
    try { return localStorage.getItem(THEME_KEY) === THEME_DARK ? THEME_DARK : THEME_LIGHT } catch (e) { return THEME_LIGHT }
  }

  function applyTheme(theme) {
    if (theme === THEME_DARK) document.documentElement.setAttribute('data-theme', THEME_DARK)
    else document.documentElement.removeAttribute('data-theme')
    for (const button of document.querySelectorAll('[data-theme-toggle]')) {
      button.setAttribute('aria-label', theme === THEME_DARK ? 'Switch to day mode' : 'Switch to night mode')
    }
  }

  function saveTheme(theme) {
    try { localStorage.setItem(THEME_KEY, theme) } catch (e) {}
  }

  applyTheme(readTheme())

  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-theme-toggle]')
    if (!target) return
    const next = readTheme() === THEME_DARK ? THEME_LIGHT : THEME_DARK
    saveTheme(next)
    applyTheme(next)
  })

  window.addEventListener('storage', (e) => { if (e.key === THEME_KEY) applyTheme(readTheme()) })
})()
