// Day or night for the platform pages: follows the device, the same two looks as the admin (adminThemes.css).
// Loaded in <head> so the page never flashes the wrong one.
(() => {
  const root = document.documentElement;
  const query = matchMedia("(prefers-color-scheme: dark)");
  const paint = () => root.setAttribute("data-rp-appearance", query.matches ? "dark" : "light");
  paint();
  query.addEventListener?.("change", paint);
})();
