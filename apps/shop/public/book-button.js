/*
 * Book button for any website (Bookings plan 4, 2.6). The owner pastes a link with `data-book-overlay` and this script
 * into another website (any website builder or blog). A click then opens the shop's booking page on top of that page,
 * in a frame; on a phone, or if anything here fails, the link simply opens the booking page in a new tab as before.
 *
 * Plain old JavaScript on purpose: it runs on websites we don't control, so it sets no globals, adds nothing until the
 * first click, and only opens addresses on the shop this file came from. Its look is fixed and neutral, so it suits any
 * site; the booking page inside follows the shop's own Studio look.
 */
(function () {
  "use strict";
  var me = document.currentScript;
  if (!me || !me.src || window.__fmBookButton) return;
  window.__fmBookButton = true;
  var shop;
  try { shop = new URL(me.src).origin; } catch (e) { return; }
  var PHONE = 600;
  var open = null;

  function bookUrl(href) {
    var url;
    try { url = new URL(href, location.href); } catch (e) { return null; }
    if (url.origin !== shop || !/^\/book\/?$/.test(url.pathname)) return null;
    url.searchParams.set("embed", "1");
    return url.toString();
  }

  function close() {
    if (!open) return;
    var o = open;
    open = null;
    document.removeEventListener("keydown", onKey, true);
    document.documentElement.style.overflow = o.overflow;
    if (o.layer.parentNode) o.layer.parentNode.removeChild(o.layer);
    if (o.from && o.from.focus) o.from.focus();
  }

  function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }

  function show(src, from, label) {
    close();
    var layer = document.createElement("div");
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-modal", "true");
    layer.setAttribute("aria-label", label);
    layer.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:rgba(17,17,17,.55);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box";
    var box = document.createElement("div");
    box.style.cssText = "position:relative;width:min(960px,100%);height:min(860px,100%);border-radius:16px;overflow:hidden;background:#ffffff;box-shadow:0 24px 64px rgba(0,0,0,.35)";
    var frame = document.createElement("iframe");
    frame.src = src;
    frame.title = label;
    frame.setAttribute("allow", "payment");
    frame.style.cssText = "border:0;width:100%;height:100%;display:block";
    var shut = document.createElement("button");
    shut.type = "button";
    shut.setAttribute("aria-label", "Close");
    shut.textContent = "×";
    shut.style.cssText = "position:absolute;top:10px;right:10px;width:44px;height:44px;border-radius:999px;border:0;background:#111111;color:#ffffff;font:400 26px/1 system-ui,sans-serif;cursor:pointer;z-index:1";
    shut.onclick = close;
    layer.onclick = function (e) { if (e.target === layer) close(); };
    box.appendChild(frame);
    box.appendChild(shut);
    layer.appendChild(box);
    open = { layer: layer, from: from, overflow: document.documentElement.style.overflow };
    document.documentElement.style.overflow = "hidden";
    document.body.appendChild(layer);
    document.addEventListener("keydown", onKey, true);
    shut.focus();
  }

  // The booking page asks to close (Escape inside it, or its own Close link) through a message from the shop.
  window.addEventListener("message", function (e) {
    if (e.origin === shop && e.data && e.data.type === "fm-book-close") close();
  });

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var el = e.target && e.target.closest ? e.target.closest("a[data-book-overlay]") : null;
    if (!el || window.innerWidth < PHONE) return;
    var src = bookUrl(el.getAttribute("href") || "");
    if (!src) return;
    e.preventDefault();
    show(src, el, (el.textContent || "").trim() || "Book a time");
  }, true);
})();
