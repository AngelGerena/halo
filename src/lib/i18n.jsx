import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

// HALO bilingual system (English / Spanish).
// Every user-facing string lives here under a key. Components call t("key")
// and get the string in the active language. Language persists in localStorage.

const STRINGS = {
  // header / brand
  "brand.tagline": { en: "Every moment, beautifully gathered", es: "Cada momento, bellamente reunido" },
  "nav.myGallery": { en: "My Gallery", es: "Mi Galería" },
  "nav.admin": { en: "Admin", es: "Administrador" },
  "footer.scripture": { en: '"For I know the plans I have for you" — Jeremiah 29:11', es: '"Porque yo sé los planes que tengo para ustedes" — Jeremías 29:11' },

  // home
  "home.title": { en: "Every moment, gathered.", es: "Cada momento, reunido." },
  "home.subtitle": {
    en: "Your congregation scans one code and uploads what they capture. HALO keeps the sharp, well-lit shots and sorts them into shareable galleries — yours to download and post.",
    es: "Tu congregación escanea un código y sube lo que captura. HALO conserva las fotos nítidas y bien iluminadas y las organiza en galerías para compartir — tuyas para descargar y publicar.",
  },
  "home.feat.scan.t": { en: "Scan", es: "Escanea" },
  "home.feat.scan.d": { en: "No app to install. One QR opens the event.", es: "Sin aplicación que instalar. Un QR abre el evento." },
  "home.feat.curate.t": { en: "Curate", es: "Cura" },
  "home.feat.curate.d": { en: "Blurry and dark shots set aside automatically.", es: "Las fotos borrosas y oscuras se apartan automáticamente." },
  "home.feat.gallery.t": { en: "Gallery", es: "Galería" },
  "home.feat.gallery.d": { en: "Each person gets their own shareable set.", es: "Cada persona recibe su propio conjunto para compartir." },
  "home.feat.export.t": { en: "Export", es: "Exporta" },
  "home.feat.export.d": { en: "You download originals for editing and socials.", es: "Descarga los originales para editar y publicar." },
  "home.cta": { en: "Open admin to create an event", es: "Abrir administrador para crear un evento" },

  // event page — sign in
  "event.invited": { en: "You're invited to capture", es: "Estás invitado a capturar" },
  "event.yourName": { en: "Your name", es: "Tu nombre" },
  "event.yourName.help": { en: "So your photos land in your own gallery to share.", es: "Para que tus fotos lleguen a tu propia galería para compartir." },
  "event.email": { en: "Email", es: "Correo electrónico" },
  "event.optional": { en: "(optional)", es: "(opcional)" },
  "event.email.help": { en: "We'll send your gallery link and let you know when photos are ready.", es: "Te enviaremos el enlace de tu galería y te avisaremos cuando las fotos estén listas." },
  "event.start": { en: "Start uploading", es: "Comenzar a subir" },
  "event.namePlaceholder": { en: "e.g. Angel Gerena", es: "ej. Angel Gerena" },
  "event.notFound.title": { en: "Event not found", es: "Evento no encontrado" },
  "event.notFound.sub": { en: "This QR code may be inactive or mistyped.", es: "Este código QR puede estar inactivo o mal escrito." },
  "event.opening": { en: "Opening the event…", es: "Abriendo el evento…" },
  "event.startError": { en: "Could not start your session. Try again.", es: "No se pudo iniciar tu sesión. Inténtalo de nuevo." },

  // uploader
  "up.welcome": { en: "Welcome", es: "Bienvenido" },
  "up.uploadEverything": { en: "upload everything, HALO keeps the best.", es: "sube todo, HALO conserva las mejores." },
  "up.onScreenNow": { en: "Your photo is on the big screen right now!", es: "¡Tu foto está en la pantalla grande ahora mismo!" },
  "up.onScreenNowSub": { en: "Look up. That one’s yours.", es: "Mira la pantalla. Esa es tuya." },
  "up.welcomeAnon": { en: "Welcome! Add a photo to get started.", es: "¡Bienvenido! Agrega una foto para empezar." },
  "up.whoTitle": { en: "Who should we thank for these?", es: "¿A quién le damos las gracias por estas?" },
  "up.whoSub": { en: "Your name goes with your photos. Add your email and we’ll send you your gallery link.", es: "Tu nombre va con tus fotos. Agrega tu correo y te enviamos el enlace de tu galería." },
  "up.whoEmail": { en: "Email (optional)", es: "Correo (opcional)" },
  "up.whoSave": { en: "That’s me", es: "Soy yo" },
  "up.whoSaving": { en: "Saving…", es: "Guardando…" },
  "up.takePhoto": { en: "Take a photo", es: "Toma una foto" },
  "up.takePhotoSub": { en: "Opens your camera. Snap it and it’s in.", es: "Abre tu cámara. Tómala y listo." },
  "up.fromLibrary": { en: "Choose from your photos", es: "Elegir de tus fotos" },
  "up.waiting": { en: "{n} waiting to send", es: "{n} esperando para enviarse" },
  "up.waitingSub": { en: "The connection dropped. We’ll keep trying. Keep this page open.", es: "Se perdió la conexión. Seguiremos intentando. Deja esta página abierta." },
  "up.tryNow": { en: "Try now", es: "Intentar ya" },
  "up.recordVideo": { en: "Record a video", es: "Graba un video" },
  "up.videoHint": { en: "Short clips up to {s} seconds play on the big screen.", es: "Videos cortos de hasta {s} segundos salen en la pantalla grande." },
  "up.clipTooLong": { en: "That video is longer than {s} seconds. Trim it in your Photos app (tap Edit) and add it again.", es: "Ese video dura más de {s} segundos. Recórtalo en tu app de Fotos (toca Editar) y agrégalo de nuevo." },
  "up.dismiss": { en: "OK", es: "OK" },
  "grid.video": { en: "Video", es: "Video" },
  "grid.playVideo": { en: "Play video", es: "Reproducir video" },
  "grid.close": { en: "Close", es: "Cerrar" },
  "ch.title": { en: "Photo challenges", es: "Retos de fotos" },
  "ch.progress": { en: "{done} of {total} done", es: "{done} de {total} listos" },
  "ch.shoot": { en: "Tap to shoot", es: "Toca para tomarla" },
  "ch.done": { en: "Done", es: "Listo" },
  "ch.now": { en: "Challenge:", es: "Reto:" },
  "ch.fromLibrary": { en: "Pick a photo", es: "Elegir foto" },
  "ch.cancel": { en: "Cancel", es: "Cancelar" },
  "live.challenge": { en: "Photo challenge", es: "Reto de foto" },
  "admin.challenges": { en: "Photo challenges", es: "Retos de fotos" },
  "admin.challenges.help": { en: "Little prompts guests tap to take a specific shot. One per line. Leave the starter list or write your own.", es: "Pequeños retos que los invitados tocan para tomar una foto específica. Uno por línea. Deja la lista inicial o escribe la tuya." },
  "admin.challengesOn": { en: "Show photo challenges to guests", es: "Mostrar retos de fotos a los invitados" },
  "admin.challengesReset": { en: "Use the starter list", es: "Usar la lista inicial" },
  "gb.title": { en: "Leave a message", es: "Deja un mensaje" },
  "gb.sub": { en: "Your words show on the big screen and go in the keepsake.", es: "Tus palabras salen en la pantalla grande y quedan en el recuerdo." },
  "gb.placeholder": { en: "Congratulations! Wishing you…", es: "¡Felicidades! Les deseo…" },
  "gb.name": { en: "Your name", es: "Tu nombre" },
  "gb.send": { en: "Send", es: "Enviar" },
  "gb.sending": { en: "Sending…", es: "Enviando…" },
  "gb.thanks": { en: "Thank you! Your message is on its way to the big screen.", es: "¡Gracias! Tu mensaje va camino a la pantalla grande." },
  "gb.another": { en: "Write another", es: "Escribir otro" },
  "gb.error": { en: "Couldn't send. Check your connection and try again.", es: "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo." },
  "live.wishFrom": { en: "A message from", es: "Un mensaje de" },
  "live.wishAnon": { en: "A message from a guest", es: "Un mensaje de un invitado" },
  "admin.wishes": { en: "Guestbook messages", es: "Mensajes del libro de visitas" },
  "admin.wishes.help": { en: "Messages guests left. They show on the live screen. Hide any you don't want shown.", es: "Mensajes que dejaron los invitados. Salen en la pantalla en vivo. Oculta los que no quieras mostrar." },
  "admin.wishesNone": { en: "No messages yet.", es: "Todavía no hay mensajes." },
  "admin.hide": { en: "Hide", es: "Ocultar" },
  "admin.show": { en: "Show", es: "Mostrar" },
  "admin.hidden": { en: "Hidden", es: "Oculto" },
  "admin.wishesDownload": { en: "Download messages", es: "Descargar mensajes" },
  "up.tapToAdd": { en: "Add your photos", es: "Agrega tus fotos" },
  "up.dragHere": { en: "You can pick a bunch at once. Tap each one, then tap “Add”.", es: "Puedes elegir varias a la vez. Toca cada una y luego “Agregar”." },
  "up.uploading": { en: "Sending", es: "Enviando" },
  "up.uploaded": { en: "Uploaded", es: "Subidas" },
  "up.keptByHalo": { en: "Kept by HALO", es: "Conservadas por HALO" },
  // ---- friendly guest upload screen (plain language, no jargon) ----
  "up.howTitle": { en: "It’s easy", es: "Es muy fácil" },
  "up.step1": { en: "Tap the big button", es: "Toca el botón grande" },
  "up.step2": { en: "Snap it or pick one", es: "Tómala o elige una" },
  "up.step3": { en: "See it on the big screen", es: "Mírala en la pantalla grande" },
  "up.hintFirst": { en: "Tap the big button above to add your first photo!", es: "¡Toca el botón grande de arriba para agregar tu primera foto!" },
  "up.countOne": { en: "1 photo added.", es: "1 foto agregada." },
  "up.countMany": { en: "{n} photos added.", es: "{n} fotos agregadas." },
  "up.hintAfter": { en: "Add more anytime.", es: "Agrega más cuando quieras." },
  "up.latestLive": { en: "It’s on the big screen!", es: "¡Ya está en la pantalla grande!" },
  "up.latestHeld": { en: "Got it! The host will take a quick look first.", es: "¡Recibida! El anfitrión le dará un vistazo primero." },
  "up.seeGallery": { en: "See everyone’s photos", es: "Ver las fotos de todos" },
  "up.yourGallery": { en: "Your gallery", es: "Tu galería" },
  "up.keptOnly": { en: "Kept only", es: "Solo conservadas" },
  "up.all": { en: "All", es: "Todas" },
  "up.copyShareLink": { en: "Copy share link", es: "Copiar enlace para compartir" },
  "up.linkCopied": { en: "Share link copied:", es: "Enlace copiado:" },

  // redesigned guest app (welcome + tabbed)
  "event.coverEmpty.title": { en: "Add a cover photo", es: "Agrega una foto de portada" },
  "event.coverEmpty.sub": { en: "The host sets the vibe — tap to upload", es: "El anfitrión marca el tono — toca para subir" },
  "event.welcomeQuote": { en: "Every photo you take tonight becomes part of the story.", es: "Cada foto que tomes esta noche se vuelve parte de la historia." },
  "event.welcomeNote": { en: "No app · No account · Yours to download for 60 days", es: "Sin app · Sin cuenta · Tuyas para descargar por 60 días" },
  "tab.add": { en: "Add", es: "Agregar" },
  "tab.gallery": { en: "Gallery", es: "Galería" },
  "tab.mine": { en: "Mine", es: "Mías" },
  "up.tapGallery": { en: "See everyone’s photos in", es: "Mira las fotos de todos en" },
  "up.allYours": { en: "All your photos", es: "Todas tus fotos" },
  "up.keptGallery": { en: "The best shots", es: "Las mejores fotos" },
  "up.everyoneTitle": { en: "Everyone’s photos", es: "Las fotos de todos" },
  "up.everyoneTitle.sub": { en: "The whole party, as it happens. New photos show up here and on the big screen.", es: "Toda la fiesta, en vivo. Las fotos nuevas aparecen aquí y en la pantalla grande." },
  "up.allYours.sub": { en: "Everything you added. Gold ones are HALO’s picks.", es: "Todo lo que agregaste. Las que tienen etiqueta dorada son las favoritas de HALO." },
  "up.emptySubEveryone": { en: "Nobody has added a photo yet. Be the first!", es: "Nadie ha agregado una foto todavía. ¡Sé el primero!" },
  "up.emptyTitle": { en: "No photos yet", es: "Aún no hay fotos" },
  "up.emptySub": { en: "Add your first photo and it’ll show up here.", es: "Agrega tu primera foto y aparecerá aquí." },

  // gallery (public)
  "gal.notFound.title": { en: "Gallery not found", es: "Galería no encontrada" },
  "gal.notFound.sub": { en: "This share link may be invalid.", es: "Este enlace para compartir puede no ser válido." },
  "gal.loading": { en: "Loading gallery…", es: "Cargando galería…" },
  "gal.curatedPhotos": { en: "curated photos", es: "fotos curadas" },
  "gal.curatedPhoto": { en: "curated photo", es: "foto curada" },
  "gal.titleSuffix": { en: "'s gallery", es: "" }, // EN: "Maria's gallery"; ES: prefix form used instead
  "gal.titlePrefix": { en: "", es: "Galería de " }, // ES: "Galería de Maria"
  "gal.empty.title": { en: "No photos yet", es: "Aún no hay fotos" },
  "gal.empty.sub": { en: "Curated shots will appear here.", es: "Las fotos curadas aparecerán aquí." },
  "gal.goHome": { en: "Go home", es: "Ir al inicio" },

  // photo grid badges
  "grid.focus": { en: "focus", es: "enfoque" },
  "grid.exp": { en: "exp", es: "exp" },
  "grid.belowThreshold": { en: "below threshold", es: "bajo el umbral" },
  "grid.edited": { en: "EDITED", es: "EDITADA" },

  // admin — gate
  "admin.super": { en: "Super admin", es: "Súper administrador" },
  "admin.checking": { en: "Checking access…", es: "Verificando acceso…" },
  "admin.enterPasscode": { en: "Enter passcode", es: "Ingresa el código" },
  "admin.passcode.help": { en: "Access is verified privately, never stored in the page.", es: "El acceso se verifica de forma privada, nunca se guarda en la página." },
  "admin.passcode": { en: "Passcode", es: "Código de acceso" },
  "admin.incorrect": { en: "Incorrect passcode.", es: "Código incorrecto." },
  "admin.checking2": { en: "Checking…", es: "Verificando…" },
  "admin.unlock": { en: "Unlock", es: "Desbloquear" },
  "admin.lock": { en: "Lock", es: "Bloquear" },

  // admin — events
  "admin.yourEvents": { en: "Your events", es: "Tus eventos" },
  "admin.loadingEvents": { en: "Loading events…", es: "Cargando eventos…" },
  "admin.noEvents.title": { en: "No events yet", es: "Aún no hay eventos" },
  "admin.noEvents.sub": { en: "Create your first event above to generate a QR code.", es: "Crea tu primer evento arriba para generar un código QR." },
  "admin.createEvent": { en: "+ Create event", es: "+ Crear evento" },
  "admin.newEvent": { en: "New event", es: "Nuevo evento" },
  "admin.eventName": { en: "Event name", es: "Nombre del evento" },
  "admin.hostChurch": { en: "Host / church", es: "Anfitrión / iglesia" },
  "admin.dateDisplay": { en: "Date (display)", es: "Fecha (a mostrar)" },
  "admin.customCode": { en: "Custom code (optional)", es: "Código personalizado (opcional)" },
  "admin.autoFromName": { en: "auto from name", es: "auto desde el nombre" },
  "admin.keepThreshold": { en: "Keep threshold", es: "Umbral de conservación" },
  "admin.spanishVersion": { en: "Spanish version", es: "Versión en español" },
  "admin.autoTranslate": { en: "Auto-translate from English", es: "Traducir automáticamente del inglés" },
  "admin.translating": { en: "Translating…", es: "Traduciendo…" },
  "admin.eventNameEs": { en: "Event name (Spanish)", es: "Nombre del evento (español)" },
  "admin.hostEs": { en: "Host / church (Spanish)", es: "Anfitrión / iglesia (español)" },
  "admin.dateEs": { en: "Date (Spanish)", es: "Fecha (español)" },
  "admin.reviewHint": { en: "Auto-filled — review and edit before saving.", es: "Autocompletado — revisa y edita antes de guardar." },
  "admin.nameRequired": { en: "Event name is required.", es: "El nombre del evento es obligatorio." },
  "admin.creating": { en: "Creating…", es: "Creando…" },
  "admin.createGenerate": { en: "Create + generate QR", es: "Crear + generar QR" },
  "admin.cancel": { en: "Cancel", es: "Cancelar" },
  "admin.failedCreate": { en: "Failed to create event", es: "No se pudo crear el evento" },

  // admin — event detail
  "admin.allEvents": { en: "← All events", es: "← Todos los eventos" },
  "admin.saveQR": { en: "Save QR", es: "Guardar QR" },
  "admin.copyLink": { en: "Copy link", es: "Copiar enlace" },
  "admin.linkCopied": { en: "Event link copied:", es: "Enlace del evento copiado:" },
  "admin.photos": { en: "Photos", es: "Fotos" },
  "admin.kept": { en: "Kept", es: "Conservadas" },
  "admin.contributors": { en: "Contributors", es: "Colaboradores" },
  "admin.launchSlideshow": { en: "▶ Launch live slideshow", es: "▶ Iniciar presentación en vivo" },
  // ---- Show on TV / projector (host setup, plain language) ----
  "tv.title": { en: "Show photos on a TV or projector", es: "Muestra las fotos en una TV o proyector" },
  "tv.sub": { en: "Guests’ photos appear on the big screen as they’re taken. Here’s the easiest way to set it up.", es: "Las fotos de los invitados aparecen en la pantalla grande a medida que las toman. Esta es la forma más fácil de configurarlo." },
  "tv.open": { en: "Open the live screen", es: "Abrir la pantalla en vivo" },
  "tv.copy": { en: "Copy TV link", es: "Copiar enlace para la TV" },
  "tv.copied": { en: "Link copied!", es: "¡Enlace copiado!" },
  "tv.step1.t": { en: "Plug a laptop into the TV or projector", es: "Conecta una laptop a la TV o al proyector" },
  "tv.step1.d": { en: "Use the HDMI cable. This is the most reliable way and works with any screen.", es: "Usa el cable HDMI. Es la forma más confiable y funciona con cualquier pantalla." },
  "tv.step2.t": { en: "Open the live screen on that laptop", es: "Abre la pantalla en vivo en esa laptop" },
  "tv.step2.d": { en: "Tap “Open the live screen” above, or scan this QR code with the laptop’s camera. No login needed.", es: "Toca “Abrir la pantalla en vivo” arriba, o escanea este código QR con la cámara de la laptop. No necesitas iniciar sesión." },
  "tv.step3.t": { en: "Tap once to go fullscreen", es: "Toca una vez para pantalla completa" },
  "tv.step3.d": { en: "The screen will ask you to tap. That’s it — photos now show up live, with music.", es: "La pantalla te pedirá que toques. Listo — las fotos aparecen en vivo, con música." },
  "tv.tip": { en: "Tip: keep the laptop plugged in and don’t let it go to sleep. The screen stays live all night.", es: "Consejo: deja la laptop enchufada y no dejes que se suspenda. La pantalla se queda en vivo toda la noche." },
  // No laptop? Phone-to-TV paths. Laptop stays the recommended route; these
  // are the fallback most hosts actually have in their pocket.
  "tv.qrFull": { en: "Show QR full screen", es: "Ver QR en pantalla completa" },
  "tv.qrClose": { en: "Close", es: "Cerrar" },
  "tv.qrFullHint": { en: "Point the laptop’s camera at this code. Tap anywhere or press Esc to close.", es: "Apunta la cámara de la laptop a este código. Toca en cualquier parte o presiona Esc para cerrar." },
  "tv.phone.t": { en: "No laptop? Use a phone instead", es: "¿Sin laptop? Usa un teléfono" },
  "tv.phone.d": { en: "You can mirror a phone to most smart TVs, Apple TV, or Chromecast. Tap your phone type for the steps.", es: "Puedes duplicar la pantalla de tu teléfono en la mayoría de los smart TVs, Apple TV o Chromecast. Toca tu tipo de teléfono para ver los pasos." },
  "tv.ios.t": { en: "iPhone or iPad", es: "iPhone o iPad" },
  "tv.ios.1": { en: "Open the live screen in Safari (tap the button above or scan the QR).", es: "Abre la pantalla en vivo en Safari (toca el botón de arriba o escanea el QR)." },
  "tv.ios.2": { en: "Swipe down from the top-right corner, tap Screen Mirroring, and pick your TV.", es: "Desliza hacia abajo desde la esquina superior derecha, toca Duplicar pantalla y elige tu TV." },
  "tv.ios.3": { en: "Tap the screen once for fullscreen. Then set Auto-Lock to Never (Settings › Display & Brightness › Auto-Lock) so the phone doesn’t go dark.", es: "Toca la pantalla una vez para pantalla completa. Luego pon Bloqueo automático en Nunca (Ajustes › Pantalla y brillo › Bloqueo automático) para que el teléfono no se apague." },
  "tv.android.t": { en: "Android", es: "Android" },
  "tv.android.1": { en: "Open the live screen in Chrome (tap the button above or scan the QR).", es: "Abre la pantalla en vivo en Chrome (toca el botón de arriba o escanea el QR)." },
  "tv.android.2": { en: "Swipe down from the top, tap Cast (Samsung calls it Smart View), and pick your TV.", es: "Desliza hacia abajo desde arriba, toca Transmitir (en Samsung se llama Smart View) y elige tu TV." },
  "tv.android.3": { en: "Tap the screen once for fullscreen. Then set Screen timeout to the longest option (Settings › Display) so it stays on.", es: "Toca la pantalla una vez para pantalla completa. Luego pon el Tiempo de espera de pantalla en la opción más larga (Ajustes › Pantalla) para que no se apague." },
  "tv.phone.warn.t": { en: "Important when using a phone", es: "Importante si usas un teléfono" },
  "tv.phone.warn.d": { en: "The TV only shows photos while that phone stays on the live screen. A call, a text, or opening another app will interrupt it. Use a spare phone if you can, turn on Do Not Disturb, and keep it plugged in. If you must use your own phone, don’t touch it until the party’s over.", es: "La TV solo muestra fotos mientras ese teléfono siga en la pantalla en vivo. Una llamada, un mensaje o abrir otra app lo interrumpe. Si puedes, usa un teléfono de repuesto, activa No molestar y déjalo enchufado. Si tienes que usar tu propio teléfono, no lo toques hasta que termine la fiesta." },
  "tv.browser.t": { en: "Smart TV with its own web browser?", es: "¿Smart TV con navegador propio?" },
  "tv.browser.d": { en: "Open the TV’s browser, type the TV link (use “Copy TV link” above to see it), and tap fullscreen. No phone or laptop needed.", es: "Abre el navegador de la TV, escribe el enlace para la TV (usa “Copiar enlace para la TV” arriba para verlo) y toca pantalla completa. No necesitas teléfono ni laptop." },
  "live.tapFull": { en: "Tap anywhere to go fullscreen", es: "Toca en cualquier parte para ver en pantalla completa" },
  "live.tapFullSub": { en: "Photos will appear here as guests take them", es: "Las fotos aparecerán aquí a medida que los invitados las tomen" },
  "admin.viewGallery": { en: "View gallery", es: "Ver galería" },
  "admin.publishing": { en: "Publishing…", es: "Publicando…" },

  // client dashboard (owner-scoped space)
  "dash.myEvents": { en: "My Events", es: "Mis Eventos" },
  "dash.space": { en: "Your space", es: "Tu espacio" },
  "dash.signOut": { en: "Sign out", es: "Cerrar sesión" },
  "dash.signedInAs": { en: "Signed in as", es: "Sesión iniciada como" },
  "dash.loading": { en: "Loading your events…", es: "Cargando tus eventos…" },
  "dash.noEvents.title": { en: "No events yet", es: "Aún no hay eventos" },
  "dash.noEvents.sub": { en: "Create your first event and share its QR code with your guests.", es: "Crea tu primer evento y comparte su código QR con tus invitados." },
  "dash.status.live": { en: "Live", es: "Activo" },
  "dash.status.published": { en: "Published", es: "Publicado" },
  "dash.manage": { en: "Manage", es: "Administrar" },
  "admin.resendEmails": { en: "Re-send gallery emails", es: "Reenviar correos de galería" },
  "admin.publishNotify": { en: "Publish + notify all", es: "Publicar + notificar a todos" },
  "admin.publishConfirm": { en: "Publish this gallery and email all contributors who left an address?", es: "¿Publicar esta galería y enviar correo a todos los colaboradores que dejaron su dirección?" },
  "admin.publishFailed": { en: "Publish failed", es: "Error al publicar" },
  "admin.published": { en: "Published", es: "Publicado" },
  "admin.emailsSent": { en: "emails sent", es: "correos enviados" },
  "admin.emailSent": { en: "email sent", es: "correo enviado" },
  "admin.failed": { en: "failed", es: "fallidos" },
  "admin.loadingCollection": { en: "Loading collection…", es: "Cargando colección…" },
  "admin.nothing.title": { en: "Nothing collected yet", es: "Aún no se ha recopilado nada" },
  "admin.nothing.sub": { en: "Print or display the QR. As people upload, every shot lands here for export.", es: "Imprime o muestra el QR. A medida que suban fotos, cada una llega aquí para exportar." },
  "admin.collection": { en: "Collection", es: "Colección" },
  "admin.autoEdited": { en: "enhanced", es: "mejoradas" },
  "admin.photosWord": { en: "photos", es: "fotos" },
  "admin.collection.help": { en: "Every photo guests added. Gold badge = HALO’s pick (sharp, well lit). Faded = HALO didn’t pick it, but it’s still here. Use Enhanced / Original to compare versions.", es: "Todas las fotos que agregaron los invitados. Etiqueta dorada = favorita de HALO (nítida, bien iluminada). Atenuada = HALO no la eligió, pero sigue aquí. Usa Mejorada / Original para comparar versiones." },
  "admin.rejected": { en: "rejected", es: "rechazadas" },
  "admin.edited": { en: "Enhanced", es: "Mejorada" },
  "admin.versionHelp": { en: "Show the auto-enhanced version or the original as uploaded", es: "Mostrar la versión mejorada automáticamente o la original" },
  "admin.enhancedBadge": { en: "ENHANCED", es: "MEJORADA" },
  "admin.enhancing": { en: "enhancing…", es: "mejorando…" },
  "admin.pickBadge": { en: "HALO pick", es: "Favorita HALO" },
  "admin.qualityWord": { en: "Quality", es: "Calidad" },
  "admin.qualityHelp": { en: "HALO’s quality score out of 100 (sharpness + lighting)", es: "Puntuación de calidad de HALO sobre 100 (nitidez + luz)" },
  "admin.downloadAllBtn": { en: "Download as ZIP", es: "Descargar en ZIP" },
  "admin.zipping": { en: "Packing {done} of {total}…", es: "Empacando {done} de {total}…" },
  "admin.zipMissing": { en: "Your ZIP is ready, but {n} photo(s) couldn't be downloaded. They're listed in missing.txt inside it.", es: "Tu ZIP está listo, pero {n} foto(s) no se pudieron descargar. Están en missing.txt dentro del ZIP." },
  "admin.zipFailed": { en: "The ZIP couldn't be made. Check your connection and try again.", es: "No se pudo crear el ZIP. Revisa tu conexión e inténtalo de nuevo." },
  "admin.cropsBtn": { en: "Social crops", es: "Recortes para redes" },
  "admin.deleteHelp": { en: "Delete this photo for good", es: "Eliminar esta foto definitivamente" },
  "admin.actionsHelp": { en: "Launch live slideshow opens the big-screen view. View gallery shows what guests see. Publish + notify emails every guest who left an address a link to download the photos; do that after the event.", es: "Iniciar presentación abre la vista de pantalla grande. Ver galería muestra lo que ven los invitados. Publicar + notificar envía a cada invitado que dejó su correo un enlace para descargar las fotos; hazlo después del evento." },
  "q.sharp": { en: "Sharp", es: "Nítida" },
  "q.soft": { en: "A little soft", es: "Un poco desenfocada" },
  "q.blurry": { en: "Blurry", es: "Borrosa" },
  "q.wellLit": { en: "well lit", es: "bien iluminada" },
  "q.dim": { en: "a bit dim", es: "algo oscura" },
  "q.poorLight": { en: "poor light", es: "poca luz" },
  "admin.original": { en: "Original", es: "Original" },
  "admin.keptOnly": { en: "HALO’s picks only", es: "Solo favoritas de HALO" },
  "admin.all": { en: "All", es: "Todas" },
  "admin.download": { en: "Download", es: "Descargar" },
  "admin.select": { en: "Select", es: "Seleccionar" },
  "admin.done": { en: "Done", es: "Listo" },
  "admin.clear": { en: "Clear", es: "Limpiar" },
  "admin.clearRejected": { en: "Clear", es: "Limpiar" }, // followed by count + "rejected"
  "admin.selected": { en: "selected", es: "seleccionadas" },
  "admin.selectAllShown": { en: "Select all shown", es: "Seleccionar todas las mostradas" },
  "admin.deleting": { en: "Deleting…", es: "Eliminando…" },
  "admin.delete": { en: "Delete", es: "Eliminar" },
  "admin.deleteConfirm1": { en: "Delete", es: "¿Eliminar" },
  "admin.deleteConfirm2": { en: "This removes the file(s) permanently and can't be undone.", es: "Esto elimina el archivo o archivos permanentemente y no se puede deshacer." },
  "admin.deleteFailed": { en: "Delete failed", es: "Error al eliminar" },
  "admin.couldNotDelete": { en: "Could not delete:", es: "No se pudo eliminar:" },

  // slideshow
  "live.preparing": { en: "Preparing the gallery…", es: "Preparando la galería…" },
  "live.notFound": { en: "Event not found.", es: "Evento no encontrado." },
  "live.waiting": { en: "Waiting for the first photo…", es: "Esperando la primera foto…" },
  "live.scanTitle": { en: "Scan to add your photos", es: "Escanea para agregar tus fotos" },
  "live.scanSub": { en: "Point your phone camera at the code. No app, no account. Your photos show up here.", es: "Apunta la cámara de tu teléfono al código. Sin app, sin cuenta. Tus fotos aparecen aquí." },
  "live.paused": { en: "paused", es: "pausado" },
  "live.pause": { en: "Pause", es: "Pausar" },
  "live.play": { en: "Play", es: "Reproducir" },
  "live.fullscreen": { en: "Fullscreen", es: "Pantalla completa" },
  // ---- V2 Phase 1: moderation gate + consent-first child safety ----
  // uploader consent (children in frame)
  "up.kidsToggle": { en: "Are there kids in your photos?", es: "\u00bfHay ni\u00f1os en tus fotos?" },
  "up.kidsHelp": { en: "Tap here if so, and the host will take a quick look before they go on the big screen.", es: "Si es as\u00ed, toca aqu\u00ed y el anfitri\u00f3n les dar\u00e1 un vistazo antes de que salgan en la pantalla grande." },
  "up.pendingReview": { en: "Pending review", es: "Pendiente de revisi\u00f3n" },
  // photo grid status badge
  "grid.pending": { en: "Waiting for host", es: "Esperando al anfitri\u00f3n" },
  "grid.pick": { en: "HALO pick", es: "Favorita de HALO" },
  // admin: safety settings on create
  "admin.safety": { en: "Safety & moderation", es: "Seguridad y moderaci\u00f3n" },
  "admin.requireReview": { en: "Review every photo before it goes public", es: "Revisar cada foto antes de hacerla p\u00fablica" },
  "admin.requireReview.help": { en: "Photos stay off the gallery and live screen until you approve them.", es: "Las fotos no aparecen en la galer\u00eda ni en la pantalla en vivo hasta que las apruebes." },
  "admin.protectMinors": { en: "Protect children (hold flagged photos)", es: "Proteger a los ni\u00f1os (retener fotos marcadas)" },
  "admin.protectMinors.help": { en: "When someone marks a photo as including children, it's held for your review even if full review is off.", es: "Cuando alguien marca una foto como que incluye ni\u00f1os, se retiene para tu revisi\u00f3n aunque la revisi\u00f3n completa est\u00e9 desactivada." },
  // admin: review queue
  "admin.reviewQueue": { en: "Review queue", es: "Cola de revisi\u00f3n" },
  "admin.pendingCount": { en: "pending", es: "pendientes" },
  "admin.approve": { en: "Approve", es: "Aprobar" },
  "admin.hide": { en: "Keep private", es: "Mantener privada" },
  "admin.restore": { en: "Restore", es: "Restaurar" },
  "admin.approveAll": { en: "Approve all", es: "Aprobar todas" },
  "admin.kidsBadge": { en: "Guest said: kids", es: "Invitado dijo: ni\u00f1os" },
  "admin.pendingBadge": { en: "Pending", es: "Pendiente" },
  "admin.hiddenBadge": { en: "Hidden", es: "Oculta" },
  "admin.allClear": { en: "Nothing waiting for review", es: "Nada esperando revisi\u00f3n" },
  "admin.moderating": { en: "Updating\u2026", es: "Actualizando\u2026" },
  "admin.reviewHintQueue": { en: "These are waiting for you. A guest said a photo might include kids, or you have “review every photo” on, or HALO auto-flagged it. Tap a photo to see it bigger. Approve puts it in galleries and on the live screen; Keep private does just that (you can still download it).", es: "Estas fotos te esperan. Un invitado dijo que podr\u00eda haber ni\u00f1os, o tienes activado \u201crevisar cada foto\u201d, o HALO la marc\u00f3 autom\u00e1ticamente. Toca una foto para verla m\u00e1s grande. Aprobar la pone en las galer\u00edas y en la pantalla en vivo; Mantener privada hace justo eso (a\u00fan puedes descargarla)." },
  "admin.viewFull": { en: "Open full size", es: "Ver en tama\u00f1o completo" },
  "pulse.live": { en: "Live right now", es: "En vivo ahora" },
  "pulse.quiet": { en: "Quiet at the moment", es: "Tranquilo por ahora" },
  "pulse.recent": { en: "in the last 5 min", es: "en los últimos 5 min" },
  "pulse.guests": { en: "guests", es: "invitados" },
  "pulse.hearts": { en: "hearts", es: "corazones" },
  "pulse.waiting": { en: "waiting for you", es: "esperándote" },
  "pulse.nothingYet": { en: "Nothing yet", es: "Nada todavía" },
  "pulse.justNow": { en: "Last activity: just now", es: "Última actividad: ahora mismo" },
  "pulse.last": { en: "Last activity:", es: "Última actividad: hace" },
  "pulse.minute": { en: "min ago", es: "min" },
  "pulse.minutes": { en: "min ago", es: "min" },
  "ready.title": { en: "Get ready for the big day", es: "Prepárate para el gran día" },
  "ready.sub": { en: "Five quick things so nothing surprises you at the event.", es: "Cinco cosas rápidas para que nada te sorprenda en el evento." },
  "ready.cover": { en: "Add a header photo (guests see it when they scan)", es: "Agrega una foto de portada (los invitados la ven al escanear)" },
  "ready.settings": { en: "Decide who sees photos and when, then Save settings", es: "Decide quién ve las fotos y cuándo, luego Guardar ajustes" },
  "ready.qr": { en: "Print the table card with the QR code", es: "Imprime la tarjeta de mesa con el código QR" },
  "admin.tableCard": { en: "Print table card", es: "Imprimir tarjeta de mesa" },
  "admin.tableCard.help": { en: "A 5x7 card with the QR and the steps, in English and Spanish. Print it or save it as a PDF.", es: "Una tarjeta 5x7 con el QR y los pasos, en inglés y español. Imprímela o guárdala como PDF." },
  "ready.photo": { en: "Add one test photo from your phone", es: "Agrega una foto de prueba desde tu teléfono" },
  "ready.live": { en: "Open the live screen once and tap for fullscreen", es: "Abre la pantalla en vivo una vez y toca para pantalla completa" },
  "ready.go": { en: "Do it", es: "Hazlo" },
  "ready.allDone": { en: "You’re ready", es: "Todo listo" },
  "ready.allDone.sub": { en: "Everything’s set. Enjoy the day.", es: "Todo está listo. Disfruta el día." },
  "ready.dismiss": { en: "Hide", es: "Ocultar" },
  "admin.look": { en: "Event look", es: "Estilo del evento" },
  "admin.look.help": { en: "The colors guests see on their phones and on the big screen. Pick one that fits the night, then Save settings.", es: "Los colores que ven los invitados en su teléfono y en la pantalla grande. Elige uno que vaya con la noche y luego Guardar ajustes." },
  "admin.modSection": { en: "Who sees photos, and when", es: "Qui\u00e9n ve las fotos y cu\u00e1ndo" },
  "admin.modSection.help": { en: "Both off = every photo goes straight to the gallery and live screen. Turn one on to hold photos for your approval first.", es: "Ambos apagados = cada foto va directo a la galer\u00eda y a la pantalla en vivo. Activa uno para retener fotos hasta que las apruebes." },
  // ---- V2 Phase 2: engagement (reactions, moment, recurring, connect CTA) ----
  "react.heart": { en: "Love this photo", es: "Me encanta esta foto" },
  "react.like": { en: "Like this photo", es: "Me gusta esta foto" },
  "live.photoWord": { en: "photo", es: "foto" },
  "live.photosWord": { en: "photos", es: "fotos" },
  "live.guestWord": { en: "guest", es: "invitado" },
  "live.guestsWord": { en: "guests", es: "invitados" },
  "live.shotOfNight": { en: "Most loved so far", es: "La más querida hasta ahora" },
  "live.by": { en: "by", es: "de" },
  "live.boardEyebrow": { en: "Leaderboard", es: "Clasificación" },
  "live.boardTitle": { en: "Top photographers tonight", es: "Los mejores fotógrafos de la noche" },
  "live.boardSub": { en: "Scan the QR code and keep shooting.", es: "Escanea el código QR y sigue tomando fotos." },
  "live.boardPhoto": { en: "photo", es: "foto" },
  "live.boardPhotos": { en: "photos", es: "fotos" },
  "live.video": { en: "VIDEO", es: "VIDEO" },
  "live.moment": { en: "Moment of the Service", es: "Momento del Servicio" },
  "connect.cta": { en: "New here? Get connected", es: "\u00bfPrimera vez? Con\u00e9ctate" },
  "connect.sub": { en: "Tap to take your next step with us.", es: "Toca para dar tu siguiente paso con nosotros." },
  // admin settings
  "admin.settings": { en: "Event settings", es: "Ajustes del evento" },
  "admin.cover": { en: "Event cover photo", es: "Foto de portada del evento" },
  "admin.cover.help": { en: "Guests see this as the welcome hero when they scan in. A couple photo, the venue, a logo — your call.", es: "Los invitados la ven como portada al escanear. Una foto de la pareja, el lugar, un logo — tú decides." },
  "admin.cover.none": { en: "No cover yet", es: "Sin portada" },
  "admin.cover.add": { en: "Upload cover", es: "Subir portada" },
  "admin.cover.change": { en: "Change cover", es: "Cambiar portada" },
  "admin.cover.remove": { en: "Remove", es: "Quitar" },
  "admin.cover.uploading": { en: "Uploading…", es: "Subiendo…" },
  "admin.cover.framing": { en: "This is how it crops on a phone. HALO framed it around the people; slide to adjust, then Save settings.", es: "Así se recorta en un teléfono. HALO lo encuadró alrededor de las personas; desliza para ajustar y luego Guardar ajustes." },
  "admin.cover.framingBusy": { en: "Finding the people…", es: "Buscando a las personas…" },
  "admin.cover.framingTop": { en: "Show more of the top", es: "Mostrar más arriba" },
  "admin.cover.framingBottom": { en: "Show more of the bottom", es: "Mostrar más abajo" },
  "admin.cover.framingAuto": { en: "Auto", es: "Automático" },
  "admin.recurring": { en: "Repeats weekly (keep the same QR)", es: "Se repite cada semana (mismo QR)" },
  "admin.recurring.help": { en: "Keep one QR for a weekly service. Start a new session each week; past weeks stay archived.", es: "Mant\u00e9n un QR para un servicio semanal. Inicia una nueva sesi\u00f3n cada semana; las semanas pasadas quedan archivadas." },
  "admin.startSession": { en: "Start new session", es: "Iniciar nueva sesi\u00f3n" },
  "admin.session": { en: "Session", es: "Sesi\u00f3n" },
  "admin.allSessions": { en: "All sessions", es: "Todas las sesiones" },
  "admin.newSessionConfirm": { en: "Start a new session? New uploads go to a fresh set; this week's photos stay archived under their date.", es: "\u00bfIniciar una nueva sesi\u00f3n? Las fotos nuevas van a un conjunto nuevo; las de esta semana quedan archivadas bajo su fecha." },
  "admin.moment": { en: "Moment of the service", es: "Momento del servicio" },
  "admin.pinTopMoment": { en: "Pin top moment", es: "Fijar destacado" },
  "admin.pinMoment": { en: "Pin as moment", es: "Fijar como momento" },
  "admin.clearMoment": { en: "Clear", es: "Quitar" },
  "admin.momentNone": { en: "No moment pinned yet", es: "A\u00fan no hay momento fijado" },
  "admin.momentBadge": { en: "Moment", es: "Momento" },
  "admin.connectCta": { en: "\u201cConnect\u201d call-to-action", es: "Llamado a la acci\u00f3n \u201cCon\u00e9ctate\u201d" },
  "admin.connectLabel": { en: "Button text (English)", es: "Texto del bot\u00f3n (ingl\u00e9s)" },
  "admin.connectLabelEs": { en: "Button text (Spanish)", es: "Texto del bot\u00f3n (espa\u00f1ol)" },
  "admin.connectUrl": { en: "Link URL", es: "URL del enlace" },
  "admin.connectHelp": { en: "Shown to contributors after they upload. Leave the URL blank to hide it.", es: "Se muestra a los colaboradores despu\u00e9s de subir. Deja la URL en blanco para ocultarlo." },
  "admin.save": { en: "Save settings", es: "Guardar ajustes" },
  "admin.saving": { en: "Saving\u2026", es: "Guardando\u2026" },
  "admin.saved": { en: "Saved", es: "Guardado" },
  "admin.saveFailed": { en: "Could not save settings", es: "No se pudieron guardar los ajustes" },
  // ---- V2 Phase 3a: smarter curation ----
  "grid.duplicate": { en: "Duplicate", es: "Duplicada" },
  "admin.duplicateBadge": { en: "Duplicate", es: "Duplicada" },
  "admin.duplicates": { en: "duplicates", es: "duplicadas" },
  // ---- V2 Phase 3b: auto-crop, auto-flag, tags ----
  "admin.socialCrops": { en: "Social crops", es: "Recortes sociales" },
  "admin.cropping": { en: "Cropping\u2026", es: "Recortando\u2026" },
  "admin.cropError": { en: "Could not make crops", es: "No se pudieron crear los recortes" },
  "admin.autoFlagged": { en: "Auto-flagged", es: "Marcada autom." },
  "admin.tagFilter": { en: "All tags", es: "Todas las etiquetas" },
  "admin.tagged": { en: "Tag", es: "Etiquetar" },
  "admin.removeTag": { en: "remove tag", es: "quitar etiqueta" },
  "tag.worship": { en: "Worship", es: "Adoraci\u00f3n" },
  "tag.baptism": { en: "Baptism", es: "Bautismo" },
  "tag.kids": { en: "Kids", es: "Ni\u00f1os" },
  "tag.fellowship": { en: "Fellowship", es: "Compa\u00f1erismo" },
  // ---- V2: delete entire event ----
  "admin.dangerZone": { en: "Danger zone", es: "Zona de peligro" },
  "admin.deleteEvent": { en: "Delete event", es: "Eliminar evento" },
  "admin.deleteEventHelp": { en: "Permanently deletes this event and every photo, contributor, and reaction in it. This cannot be undone.", es: "Elimina permanentemente este evento y todas sus fotos, colaboradores y reacciones. Esto no se puede deshacer." },
  "admin.deleteEventConfirm": { en: "Type the event code to permanently delete it:", es: "Escribe el c\u00f3digo del evento para eliminarlo permanentemente:" },
  "admin.deleteEventMismatch": { en: "Code did not match \u2014 nothing was deleted.", es: "El c\u00f3digo no coincide \u2014 no se elimin\u00f3 nada." },
  "admin.deletingEvent": { en: "Deleting event\u2026", es: "Eliminando evento\u2026" },
  "admin.deleteEventFailed": { en: "Could not delete the event", es: "No se pudo eliminar el evento" },
  // ---- Landing hero carousel (admin) ----
  "admin.heroManage": { en: "Landing hero images", es: "Im\u00e1genes del hero de inicio" },
  "admin.heroHelp": { en: "Upload images for the homepage hero carousel. Active images rotate in order.", es: "Sube im\u00e1genes para el carrusel del hero. Las activas rotan en orden." },
  "admin.heroUpload": { en: "Upload images", es: "Subir im\u00e1genes" },
  "admin.heroUploading": { en: "Uploading\u2026", es: "Subiendo\u2026" },
  "admin.heroEmpty": { en: "No hero images yet — the default image is shown.", es: "A\u00fan no hay im\u00e1genes — se muestra la predeterminada." },
  "admin.heroActive": { en: "Active", es: "Activa" },
  // ---- Event type + slideshow music ----
  "admin.category": { en: "Event type", es: "Tipo de evento" },
  "cat.wedding": { en: "Wedding", es: "Boda" },
  "cat.quinceanera": { en: "Quincea\u00f1era", es: "Quincea\u00f1era" },
  "cat.church": { en: "Church service", es: "Servicio de iglesia" },
  "cat.corporate": { en: "Corporate", es: "Corporativo" },
  "cat.gala": { en: "Gala / Fundraiser", es: "Gala / Recaudaci\u00f3n" },
  "cat.other": { en: "Other", es: "Otro" },
  "admin.music": { en: "Slideshow music", es: "M\u00fasica de la presentaci\u00f3n" },
  "admin.musicHelp": { en: "Plays on the live slideshow. Auto matches your event type, or pick a track. Upload your own only if you have the rights.", es: "Se reproduce en la presentaci\u00f3n en vivo. Coincide autom\u00e1ticamente con tu tipo de evento, o elige una pista. Sube la tuya solo si tienes los derechos." },
  "admin.musicAuto": { en: "Auto (use my library, if any)", es: "Autom\u00e1tico (usar mi biblioteca, si hay)" },
  "admin.musicNone": { en: "No music", es: "Sin m\u00fasica" },
  "admin.musicUpload": { en: "Upload your own track", es: "Sube tu propia pista" },
  "admin.musicUploading": { en: "Uploading\u2026", es: "Subiendo\u2026" },
  "admin.musicCustom": { en: "Custom track uploaded", es: "Pista personalizada subida" },
  "music.elegant": { en: "Elegant", es: "Elegante" },
  "music.uplifting": { en: "Uplifting", es: "Alegre" },
  "music.worship": { en: "Worshipful", es: "Adoraci\u00f3n" },
  "live.musicOn": { en: "Music on", es: "M\u00fasica activada" },
  "live.musicOff": { en: "Music off", es: "M\u00fasica desactivada" },
  // ---- Rights acknowledgment + legal ----
  "admin.musicRights": { en: "I confirm I own or have the rights to use this track, and I take responsibility for its use.", es: "Confirmo que poseo o tengo los derechos para usar esta pista y asumo la responsabilidad de su uso." },
  "admin.musicRightsNeeded": { en: "Check the box above to upload your own track.", es: "Marca la casilla de arriba para subir tu propia pista." },
  "footer.legal": { en: "Terms & Privacy", es: "T\u00e9rminos y Privacidad" },
  "music.celebration": { en: "Celebration", es: "Celebraci\u00f3n" },
  "music.corporate": { en: "Corporate", es: "Corporativo" },
  "music.cinematic": { en: "Cinematic", es: "Cinematogr\u00e1fico" },
  "music.acoustic": { en: "Acoustic", es: "Ac\u00fastico" },
  // ---- Mubert music library (admin) ----
  "admin.musicLib": { en: "Music library (AI-generated)", es: "Biblioteca de m\u00fasica (IA)" },
  "admin.musicLibHelp": { en: "Generate royalty-free tracks by mood (via Mubert) and cache them for hosts to pick.", es: "Genera pistas libres de regal\u00edas por estado de \u00e1nimo (v\u00eda Mubert) y gu\u00e1rdalas para que los anfitriones elijan." },
  "admin.musicGenerate": { en: "Generate", es: "Generar" },
  "admin.musicGenerating": { en: "Generating\u2026", es: "Generando\u2026" },
  "admin.musicLibEmpty": { en: "No tracks yet. Pick a mood and generate.", es: "A\u00fan no hay pistas. Elige un estado de \u00e1nimo y genera." },
  "admin.musicFromLib": { en: "Library", es: "Biblioteca" },
  "admin.musicUploadTips": { en: "Tip: license a track you can use from Uppbeat, the YouTube Audio Library, or Pixabay Music, then upload it here.", es: "Consejo: licencia una pista que puedas usar de Uppbeat, la biblioteca de audio de YouTube o Pixabay Music, y s\u00fabela aqu\u00ed." },

  // admin \u2014 client accounts (owners + client list)
  "admin.owner": { en: "Owner", es: "Propietario" },
  "admin.ownerUnassigned": { en: "\u2014 (unassigned)", es: "\u2014 (sin asignar)" },
  "admin.ownerYou": { en: "you", es: "t\u00fa" },
  "admin.createFor": { en: "Owner (create on behalf of a client)", es: "Propietario (crear en nombre de un cliente)" },
  "admin.createForSelf": { en: "Me (keep this event mine)", es: "Yo (mantener este evento m\u00edo)" },
  "admin.createForHelp": { en: "Leave as yourself, or assign this event to a client account.", es: "D\u00e9jalo como t\u00fa, o asigna este evento a una cuenta de cliente." },
  "admin.reassign": { en: "Reassign owner", es: "Reasignar propietario" },
  "admin.reassignHelp": { en: "Change which client account owns this event.", es: "Cambia qu\u00e9 cuenta de cliente es due\u00f1a de este evento." },
  "admin.reassignSave": { en: "Save owner", es: "Guardar propietario" },
  "admin.reassignSaving": { en: "Saving\u2026", es: "Guardando\u2026" },
  "admin.reassignDone": { en: "Owner updated.", es: "Propietario actualizado." },
  "admin.clients": { en: "Clients", es: "Clientes" },
  "admin.clientsHelp": { en: "Everyone with a HALO account, and how many events each owns.", es: "Todos los que tienen una cuenta HALO y cu\u00e1ntos eventos posee cada uno." },
  "admin.clientsEmpty": { en: "No client accounts yet. They appear here once people sign up.", es: "A\u00fan no hay cuentas de clientes. Aparecer\u00e1n aqu\u00ed cuando la gente se registre." },
  "admin.clientAdmin": { en: "Admin", es: "Administrador" },
  "admin.clientEvents": { en: "events", es: "eventos" },
  "admin.clientJoined": { en: "Joined", es: "Se uni\u00f3" },
  "admin.clientNoName": { en: "(no name)", es: "(sin nombre)" },
};

const LANG_KEY = "halo_lang";
const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = typeof localStorage !== "undefined" && localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "es") return saved;
    // Default from the phone's language settings: the first of the guest's
    // preferred languages that HALO speaks (so an "es-US" phone, or one set
    // to Spanish with English as a backup, opens in Spanish). Fallback English.
    try {
      const prefs = (typeof navigator !== "undefined" && (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language])) || [];
      for (const l of prefs) {
        const c = String(l || "").toLowerCase();
        if (c.startsWith("es")) return "es";
        if (c.startsWith("en")) return "en";
      }
    } catch {}
    return "en";
  });

  // Keep <html lang> in step so screen readers and translators know the language.
  useEffect(() => {
    try { document.documentElement.lang = lang; } catch {}
  }, [lang]);

  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch {}
  }, []);

  const t = useCallback((key) => {
    const entry = STRINGS[key];
    if (!entry) return key; // surface missing keys instead of crashing
    return entry[lang] ?? entry.en ?? key;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t, ev: (event, field) => localizedField(event, field, lang) }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) return { lang: "en", setLang: () => {}, t: (k) => (STRINGS[k]?.en ?? k), ev: (e, f) => e?.[f] };
  return ctx;
}

// Pick the right-language value for an event content field.
// ev(event, "name") -> event.name_es in Spanish (if present), else event.name.
export function localizedField(event, field, lang) {
  if (!event) return "";
  if (lang === "es") {
    const es = event[`${field}_es`];
    if (es && String(es).trim()) return es;
  }
  return event[field] || "";
}
