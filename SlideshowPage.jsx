import React, { createContext, useContext, useState, useCallback } from "react";

// HALO bilingual system (English / Spanish).
// Every user-facing string lives here under a key. Components call t("key")
// and get the string in the active language. Language persists in localStorage.

const STRINGS = {
  // header / brand
  "brand.tagline": { en: "Holy moments, auto-curated", es: "Momentos sagrados, curados automáticamente" },
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
