(() => {
  "use strict";
  const menuButton = document.querySelector(".menu-toggle");
  const menu = document.querySelector(".nav-links");
  // Reading progress and header state share the measured driver in motion.js.

  function closeMenu(returnFocus = false) {
    if (!menu || !menuButton) return;
    menu.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Abrir menu");
    if (returnFocus) menuButton.focus();
  }
  menuButton?.addEventListener("click", () => {
    const open = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!open));
    menuButton.setAttribute("aria-label", open ? "Abrir menu" : "Fechar menu");
    menu?.classList.toggle("is-open", !open);
  });
  menu?.querySelectorAll("a").forEach(link => link.addEventListener("click", () => closeMenu()));
  document.addEventListener("click", event => {
    if (menu && menuButton && !menu.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && menuButton?.getAttribute("aria-expanded") === "true") closeMenu(true);
  });
  window.matchMedia("(min-width: 801px)").addEventListener("change", () => closeMenu());

  document.querySelectorAll(".faq-list details").forEach(detail => {
    detail.addEventListener("toggle", () => {
      document.dispatchEvent(new CustomEvent("nexo:layout"));
      if (!detail.open) return;
      document.querySelectorAll(".faq-list details").forEach(other => {
        if (other !== detail) other.open = false;
      });
    });
  });
  const year = document.querySelector("[data-year]");
  if (year) year.textContent = new Date().getFullYear();
})();
