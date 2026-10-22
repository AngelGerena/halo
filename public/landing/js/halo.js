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
    "cta.tryFree": "Pruébalo gratis",
    "cta.haveAccount": "Ya tengo una cuenta",
    "intro.eyebrow": "ESTO ES HALO",
    "intro.title": "Cada momento,<br><em>reunido.</em>",
    "intro.lead": "Escanea un código QR y cada foto que tomen tus invitados llega a una sola galería en vivo — organizada y realzada automáticamente, lista para revivir y compartir apenas termina la fiesta. Sin app que descargar. Sin que tus invitados tengan que registrarse.",
    "band.eyebrow": "TODOS SON FOTÓGRAFOS",
    "band.title": "Cada invitado. Cada ángulo.<br><em>Una galería que brilla.</em>",
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
    "feat.title": "Todo, resuelto por ti.",
    "feat.curate.t": "Selección inteligente",
    "feat.curate.d": "HALO elige las mejores fotos y filtra las borrosas, repetidas y accidentales.",
    "feat.enhance.t": "Realce automático",
    "feat.enhance.d": "Cada foto recibe luz, color y nitidez balanceados apenas se sube.",
    "feat.slideshow.t": "Presentación en vivo",
    "feat.slideshow.d": "Ábrela en cualquier pantalla del lugar — las fotos aparecen en segundos mientras los invitados disparan.",
    "feat.perguest.t": "Galerías por invitado",
    "feat.perguest.d": "Mira quién tomó qué — cada persona tiene su propia vista.",
    "feat.email.t": "Entrega por correo",
    "feat.email.d": "Envía la galería terminada directo al correo de tus invitados.",
    "feat.bilingual.t": "Bilingüe EN / ES",
    "feat.bilingual.d": "Toda la experiencia en inglés o español, con un solo toque.",
    "feat.noapp.t": "Sin app",
    "feat.noapp.d": "Los invitados solo escanean y toman fotos en su navegador. Nada que instalar.",
    "feat.control.t": "Control total",
    "feat.control.d": "Quita cualquier foto que no quieras, una por una o en grupo.",
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
    var nav = (navigator.language || navigator.userLanguage || "en").toLowerCase();
    initial = nav.indexOf("es") === 0 ? "es" : "en";
  }
  apply(initial);
})();
