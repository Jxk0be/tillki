// Applies the saved theme before first paint so dark mode doesn't flash light.
// A separate file (not inline) so the Content Security Policy can stay strict.
;(function () {
  var mode = 'system'
  try {
    mode = localStorage.getItem('kura-theme') || 'system'
  } catch {
    // storage blocked: follow the system setting
  }
  var dark =
    mode === 'dark' ||
    (mode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) document.documentElement.classList.add('dark')
})()
