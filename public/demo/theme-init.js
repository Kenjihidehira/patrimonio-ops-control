(() => {
  const match = document.cookie.match(/(?:^|;\s*)patrimonio_theme=(light|dark)(?:;|$)/);
  const theme = match?.[1] || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
})();
