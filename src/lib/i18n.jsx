import React, { createContext, useContext, useState, useCallback } from "react";

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
  "up.tapToAdd": { en: "Tap to add photos", es: "Toca para agregar fotos" },
  "up.dragHere": { en: "or drag them here · JPG, PNG, HEIC", es: "o arrástralas aquí · JPG, PNG, HEIC" },
  "up.uploading": { en: "Uploading", es: "Subiendo" },
  "up.uploaded": { en: "Uploaded", es: "Subidas" },
  "up.keptByHalo": { en: "Kept by HALO", es: "Conservadas por HALO" },
  "up.yourGallery": { en: "Your gallery", es: "Tu galería" },
  "up.keptOnly": { en: "Kept only", es: "Solo conservadas" },
  "up.all": { en: "All", es: "Todas" },
  "up.copyShareLink": { en: "Copy share link", es: "Copiar enlace para compartir" },
  "up.linkCopied": { en: "Share link copied:", es: "Enlace copiado:" },

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
  "admin.publishing": { en: "Publishing…", es: "Publicando…" },
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
  "admin.autoEdited": { en: "auto-edited", es: "auto-editadas" },
  "admin.rejected": { en: "rejected", es: "rechazadas" },
  "admin.edited": { en: "Edited", es: "Editada" },
  "admin.original": { en: "Original", es: "Original" },
  "admin.keptOnly": { en: "Kept only", es: "Solo conservadas" },
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
  "live.waiting": { en: "Waiting for the first moment…", es: "Esperando el primer momento…" },
  "live.paused": { en: "paused", es: "pausado" },
  "live.pause": { en: "Pause", es: "Pausar" },
  "live.play": { en: "Play", es: "Reproducir" },
  "live.fullscreen": { en: "Fullscreen", es: "Pantalla completa" },
  // ---- V2 Phase 1: moderation gate + consent-first child safety ----
  // uploader consent (children in frame)
  "up.kidsToggle": { en: "These photos include children", es: "Estas fotos incluyen ni\u00f1os" },
  "up.kidsHelp": { en: "We'll hold them for the team to review before they appear publicly or on the screen.", es: "Las retendremos para que el equipo las revise antes de mostrarlas p\u00fablicamente o en la pantalla." },
  "up.pendingReview": { en: "Pending review", es: "Pendiente de revisi\u00f3n" },
  // photo grid status badge
  "grid.pending": { en: "Pending review", es: "Pendiente de revisi\u00f3n" },
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
  "admin.hide": { en: "Hide", es: "Ocultar" },
  "admin.restore": { en: "Restore", es: "Restaurar" },
  "admin.approveAll": { en: "Approve all", es: "Aprobar todas" },
  "admin.kidsBadge": { en: "Children", es: "Ni\u00f1os" },
  "admin.pendingBadge": { en: "Pending", es: "Pendiente" },
  "admin.hiddenBadge": { en: "Hidden", es: "Oculta" },
  "admin.allClear": { en: "Nothing waiting for review", es: "Nada esperando revisi\u00f3n" },
  "admin.moderating": { en: "Updating\u2026", es: "Actualizando\u2026" },
  "admin.reviewHintQueue": { en: "Approve to make public, or hide to keep it out of galleries and the live screen.", es: "Aprueba para hacerla p\u00fablica u oc\u00faltala para mantenerla fuera de las galer\u00edas y la pantalla en vivo." },
  // ---- V2 Phase 2: engagement (reactions, moment, recurring, connect CTA) ----
  "react.heart": { en: "Love this photo", es: "Me encanta esta foto" },
  "live.moment": { en: "Moment of the Service", es: "Momento del Servicio" },
  "connect.cta": { en: "New here? Get connected", es: "\u00bfPrimera vez? Con\u00e9ctate" },
  "connect.sub": { en: "Tap to take your next step with us.", es: "Toca para dar tu siguiente paso con nosotros." },
  // admin settings
  "admin.settings": { en: "Event settings", es: "Ajustes del evento" },
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
  "admin.musicAuto": { en: "Auto (match event type)", es: "Autom\u00e1tico (seg\u00fan el tipo)" },
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
};

const LANG_KEY = "halo_lang";
const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = typeof localStorage !== "undefined" && localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "es") return saved;
    // default from browser, fallback English
    const nav = typeof navigator !== "undefined" ? navigator.language : "en";
    return nav && nav.toLowerCase().startsWith("es") ? "es" : "en";
  });

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
