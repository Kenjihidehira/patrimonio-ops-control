(function initializeTheme() {
  var match = document.cookie.match(/(?:^|; )patrimonio_theme=(dark|light)/);
  var theme = match
    ? match[1]
    : matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  document.documentElement.dataset.theme = theme;
}());
