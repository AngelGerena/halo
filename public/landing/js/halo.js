// Pricing toggle: per-event <-> subscription
(function(){
  var tabs = document.querySelectorAll('.toggle-btn');
  var groups = document.querySelectorAll('[data-plan-group]');
  function show(plan){
    tabs.forEach(function(t){
      var on = t.getAttribute('data-plan') === plan;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    groups.forEach(function(g){
      g.classList.toggle('hidden', g.getAttribute('data-plan-group') !== plan);
    });
  }
  tabs.forEach(function(t){
    t.addEventListener('click', function(){ show(t.getAttribute('data-plan')); });
  });
})();

/* The old early-access "waitlist" signup form (which posted to the
   request-access function and emailed a "we'll reach out" reply) has been
   retired. The landing page now sends visitors straight to the real self-serve
   signup at /signup, where they create an account and build events themselves.
   The request-access function is kept in the repo in case the waitlist is ever
   wanted again, but nothing on the public page calls it. */

/* ============ LANGUAGE TOGGLE (EN / ES) ============ */
/* Every translatable element carries data-i18n="key". English lives in the HTML
   (the default + fallback). Spanish lives in the ES dictionary below. The toggle
   swaps innerHTML by key, remembers the choice in localStorage, and updates the
   <html lang> attribute and the document title. Copy is written to read naturally
   in Spanish for a church/quinceañera/wedding audience, not literal translation. */
(function(){
  var EN = {}; // captured from the page on load, so EN always restores exactly.

  var ES = {
    "meta.title": "HALO | Cada momento, reunido",
    "hero.eyebrow": "TODO EVENTO MERECE ESTO",
    "hero.sub": "Un solo código QR.<br>Cada invitado, un fotógrafo.",
    "hero.niche": "Para bodas, quinceañeras, iglesias y toda celebración",
    "hero.scroll": "DESLIZA",
    "cta.create": "Crea tu evento",
    "cta.how": "Cómo funciona",
    "cta.demo": "Prueba la demo en vivo",
    "demo.t": "Pruébalo tú mismo, ahora",
    "demo.d": "Sé el invitado: toma una foto y mírala llegar a una pantalla en vivo, con corazones y todo. Escanea con tu teléfono o ábrela aquí. No se guarda nada.",
    "demo.cta": "Abrir la demo en vivo",
    "cta.tryFree": "Pruébalo gratis",
    "cta.haveAccount": "Ya tengo una cuenta",
    "intro.eyebrow": "ESTO ES HALO",
    "intro.title": "Cada momento,<br><em>reunido.</em>",
    "intro.lead": "Escanea un código QR y cada foto que tomen tus invitados llega a una sola galería en vivo — organizada y realzada automáticamente, lista para revivir y compartir apenas termina la fiesta. Sin app que descargar. Sin que tus invitados tengan que registrarse.",
    "band.eyebrow": "TODOS SON FOTÓGRAFOS",
    "band.title": "Cada invitado. Cada ángulo.<br><em>Una galería que brilla.</em>",
    "moments.eyebrow": "MOMENTOS REALES",
    "moments.title": "Tus invitados ya tienen las fotos.<br><em>HALO las reúne.</em>",
    "how.eyebrow": "CÓMO FUNCIONA",
    "how.title": "Cuatro pasos. Cero complicaciones.",
    "how.s1.t": "Crea tu evento",
    "how.s1.d": "Ponle nombre, elige la fecha y HALO te entrega un código QR y un afiche personalizados en segundos.",
    "how.s2.t": "Los invitados escanean y toman fotos",
    "how.s2.d": "Apuntan el teléfono al código y suben sus fotos. Sin app, sin cuenta, sin complicaciones.",
    "how.s3.t": "HALO organiza y realza",
    "how.s3.d": "Las fotos borrosas y repetidas se apartan solas, y cada foto buena recibe luz y color balanceados automáticamente.",
    "how.s4.t": "Revive y comparte",
    "how.s4.d": "Míralo en la presentación en vivo durante el evento, y después descarga y comparte la galería completa.",
    "use.eyebrow": "HECHO PARA CADA CELEBRACIÓN",
    "use.title": "Una herramienta. Todo tipo de momento.",
    "use.weddings.t": "Bodas",
    "use.weddings.d": "Captura cada ángulo que tu fotógrafo no alcanza — todo el día, desde los ojos de quienes te quieren.",
    "use.quince.t": "Quinceañeras",
    "use.quince.d": "Cada baile, cada lágrima y cada momento espontáneo de quienes están en el salón.",
    "use.churches.t": "Iglesias",
    "use.churches.d": "Bautizos, cultos, conferencias — la mirada de toda tu congregación, en un solo lugar.",
    "use.corporate.t": "Empresas",
    "use.corporate.d": "Conferencias, galas y lanzamientos, documentados por cada asistente automáticamente.",
    "use.parties.t": "Fiestas",
    "use.parties.d": "Cumpleaños, reuniones, graduaciones — nada se pierde, nada queda enterrado en un chat de grupo.",
    "use.photographers.t": "Fotógrafos",
    "use.photographers.d": "Ofrece a tus clientes una galería de invitados con tu marca que funciona sola.",
    "feat.eyebrow": "FUNCIONES",
    "fx.title.host": "Todo lo que tus invitados <em>aman</em>.",
    "fx.sub.host": "Un c\u00f3digo QR convierte a cada invitado en tu fot\u00f3grafo, y la pantalla grande en el alma de la fiesta.",
    "fx.title.spons": "Patrocinadores que <em>brillan</em> toda la noche.",
    "fx.sub.spons": "Galas, eventos ben\u00e9ficos y corporativos pueden vender tiempo real en pantalla. HALO pone a cada patrocinador frente a cada invitado, con buen gusto.",
    "fx.tab.host": "Para anfitriones",
    "fx.tab.spons": "Para patrocinadores",
    "fx.h.scan.t": "Sin app. Solo escanea.",
    "fx.h.scan.d": "Los invitados escanean un c\u00f3digo QR y toman fotos desde el navegador. Nada que descargar, en ingl\u00e9s o espa\u00f1ol.",
    "fx.h.wall.t": "Una pantalla en vivo que anima la fiesta",
    "fx.h.wall.d": "Las fotos llegan a la pantalla en segundos, con la Foto de la noche, corazones y un contador de fotos.",
    "fx.h.mosaic.t": "El mosaico de fotos",
    "fx.h.mosaic.d": "Tu foto de portada armada con cientos de fotos de tus invitados, en vivo, mientras avanza la noche.",
    "fx.h.video.t": "Libro de video",
    "fx.h.video.d": "Mensajes en video de diez segundos que se ven en la pantalla y te llevas como recuerdo.",
    "fx.h.games.t": "Juegos que sacan los celulares",
    "fx.h.games.d": "Retos de fotos, la tabla de mejores fot\u00f3grafos, boomerangs y filtros divertidos.",
    "fx.h.frame.t": "Tu marco de recuerdo",
    "fx.h.frame.d": "Cada foto que los invitados guardan o comparten lleva sus nombres, la fecha y un logo peque\u00f1o.",
    "fx.x.curate.t": "Selecci\u00f3n autom\u00e1tica",
    "fx.x.curate.d": "Las fotos borrosas y repetidas se filtran solas.",
    "fx.x.highlight.t": "Video resumen",
    "fx.x.highlight.d": "Un video listo para publicar despu\u00e9s del evento.",
    "fx.x.cohost.t": "Coanfitriones",
    "fx.x.cohost.d": "Comparte el control con tu familia o tu planificador.",
    "fx.x.control.t": "T\u00fa tienes el control",
    "fx.x.control.d": "Modo de revisi\u00f3n, protecci\u00f3n para ni\u00f1os y borra lo que quieras.",
    "fx.s.seen.t": "A la vista toda la noche",
    "fx.s.seen.d": "Ocho estilos para la pantalla, desde un logo discreto en la esquina hasta una barra lateral o una banda estilo TV.",
    "fx.s.moment.t": "Due\u00f1o de un momento",
    "fx.s.moment.d": "Patrocina la Foto de la noche, la tabla de fot\u00f3grafos, el mosaico o los mensajes en video.",
    "fx.s.shared.t": "En cada foto compartida",
    "fx.s.shared.d": "El logo del patrocinador principal viaja en las fotos que los invitados suben a Instagram y mandan por chat.",
    "fx.s.breaks.t": "Agradecimientos en pantalla completa",
    "fx.s.breaks.d": "Cada patrocinador tiene su propia pantalla completa en pausas cortas y elegantes.",
    "fx.s.leads.t": "Contactos con permiso",
    "fx.s.leads.d": "Los invitados pueden dejar su correo o tel\u00e9fono con una casilla clara. Descarga una hoja de c\u00e1lculo limpia despu\u00e9s.",
    "fx.s.tiers.t": "Niveles como tus paquetes",
    "fx.s.tiers.d": "Principal, Oro y Comunidad, listos para los niveles de patrocinio que ya vendes.",
    "fx.s.note": "Las herramientas de patrocinio se activan por evento. Las bodas y fiestas familiares nunca las ven si el anfitri\u00f3n no quiere.",
    "fx.cta.spons": "Planea un evento patrocinado",
    "fx.chip.scan": "Escanea. Toma. Listo.",
    "fx.chip.spot": "Foto de la noche &middot; 48",
    "fx.chip.count": "312 fotos &middot; 86 invitados",
    "fx.chip.mosaic": "Hecho con 286 de sus fotos",
    "fx.chip.msg": "Un mensaje para los novios",
    "fx.chip.from": "de T&iacute;a Rosa &middot; 0:09",
    "fx.chip.by": "presentado por",
    "fx.chip.possible": "Esta noche es posible gracias a",
    "fx.board.t": "Mejores fot\u00f3grafos de la noche",
    "fx.csv.name": "Nombre",
    "fx.csv.phone": "Tel\u00e9fono",
    "fx.csv.opt": "Permiso",
    "fx.csv.yes": "s\u00ed",
    "price.eyebrow": "PRECIOS",
    "price.title": "Paga por evento, o ve ilimitado.",
    "price.perEvent": "Por evento",
    "price.subscription": "Suscripción",
    "price.note": "Los precios son iniciales — se ajustarán antes del lanzamiento.",
    "start.eyebrow": "Empieza gratis",
    "start.title": "Crea tu <em>primer evento</em>",
    "start.lead": "Abre tu cuenta gratis, ponle nombre a tu evento y HALO te entrega un código QR y un afiche en segundos. Sin tarjeta de crédito, sin nada que instalar para tus invitados.",
    "start.fine": "Gratis para empezar. Solo pagas cuando estés listo para lanzar.",
    "final.title": "Tu evento.<br><em>Cada ángulo.</em>",
    "final.lead": "Un solo código QR. Cada invitado, un fotógrafo. Cada momento, reunido.",
    "footer.tag": "Cada momento, reunido.",
    "footer.credit": "Creado por <a href=\"https://finessemedia.pro\" target=\"_blank\" rel=\"noopener\">Finesse Media</a>"
  };

  var DICT = { en: EN, es: ES };
  var nodes = Array.prototype.slice.call(document.querySelectorAll("[data-i18n]"));

  // Capture the original English HTML of every tagged node as the EN dictionary.
  nodes.forEach(function(el){
    var key = el.getAttribute("data-i18n");
    if (key && !(key in EN)) EN[key] = el.innerHTML;
  });

  function apply(lang){
    if (lang !== "es") lang = "en";
    var dict = DICT[lang] || EN;
    nodes.forEach(function(el){
      var key = el.getAttribute("data-i18n");
      var val = (key in dict) ? dict[key] : EN[key];
      if (val != null) el.innerHTML = val;
    });
    // <title> is tagged too; make sure the real document title updates.
    if (("meta.title" in dict) && dict["meta.title"]) document.title = dict["meta.title"];
    document.documentElement.setAttribute("lang", lang);
    // Reflect pressed state on the buttons.
    Array.prototype.forEach.call(document.querySelectorAll(".lang-btn"), function(b){
      b.setAttribute("aria-pressed", b.getAttribute("data-lang") === lang ? "true" : "false");
    });
    try { localStorage.setItem("halo_lang", lang); } catch(e){}
  }

  // Wire the buttons.
  Array.prototype.forEach.call(document.querySelectorAll(".lang-btn"), function(b){
    b.addEventListener("click", function(){ apply(b.getAttribute("data-lang")); });
  });

  // Initial language: saved choice, else the browser's preference, else English.
  var initial = null;
  try { initial = localStorage.getItem("halo_lang"); } catch(e){}
  if (!initial) {
    // First of the visitor's preferred languages that HALO speaks.
    var prefs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || navigator.userLanguage || "en"];
    initial = "en";
    for (var i = 0; i < prefs.length; i++) {
      var c = String(prefs[i] || "").toLowerCase();
      if (c.indexOf("es") === 0) { initial = "es"; break; }
      if (c.indexOf("en") === 0) { initial = "en"; break; }
    }
  }
  apply(initial);
})();

/* Features: hosts / sponsors tabs and the mosaic tile grid. */
(function(){
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".fx-tab"));
  if (!tabs.length) return;
  function pick(which, focus){
    tabs.forEach(function(t){
      var on = t.getAttribute("data-fx") === which;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(t.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
      if (on && focus) t.focus();
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-fx-head]"), function(h){ h.hidden = h.getAttribute("data-fx-head") !== which; });
  }
  tabs.forEach(function(t, i){
    t.addEventListener("click", function(){ pick(t.getAttribute("data-fx")); });
    t.addEventListener("keydown", function(e){
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        var n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        pick(n.getAttribute("data-fx"), true); e.preventDefault();
      }
    });
  });
  if (location.hash === "#sponsors") pick("spons");
  Array.prototype.forEach.call(document.querySelectorAll(".fx-mosaic"), function(m){
    var h = "";
    for (var i = 0; i < 144; i++) {
      var x = i % 16, y = Math.floor(i / 16), d = Math.hypot(x - 7.5, (y - 4.5) * 1.6);
      var l = Math.max(18, 78 - d * 7) + ((i * 37) % 13), hue = [330, 20, 280, 200][i % 4];
      h += '<i style="background:hsla(' + hue + ',' + (45 + (i * 7) % 30) + '%,' + l + '%,.42)"></i>';
    }
    m.innerHTML = h;
  });
})();
