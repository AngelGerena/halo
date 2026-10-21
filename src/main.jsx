import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { I18nProvider } from "./lib/i18n.jsx";
import "./styles.css";

import EventPage from "./pages/EventPage.jsx";
import GalleryPage from "./pages/GalleryPage.jsx";
import Admin from "./pages/Admin.jsx";
import SlideshowPage from "./pages/SlideshowPage.jsx";
import Legal from "./pages/Legal.jsx";

// The app is product-only. The marketing/landing page lives on the separate
// halo-gallery-site. Any hit to the bare root (or an unknown route) bounces
// there instead of showing a duplicate marketing page.
const LANDING_URL = "https://get.finessemedia.pro";
function ToLanding() {
  React.useEffect(() => { window.location.replace(LANDING_URL); }, []);
  return null;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ToLanding />} />
          <Route path="/e/:code" element={<EventPage />} />
          <Route path="/g/:contributorId" element={<GalleryPage />} />
          <Route path="/live/:code" element={<SlideshowPage />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="*" element={<ToLanding />} />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>
);
