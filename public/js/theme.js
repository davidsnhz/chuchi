// Se carga antes que nada para que no parpadee el tema
(function () {
  try {
    var t = JSON.parse(localStorage.getItem("sushi-contador-v1")).settings.theme;
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {
    /* primera visita */
  }
})();
