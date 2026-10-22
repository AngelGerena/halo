import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { I18nProvider } from "./lib/i18n.jsx";
import { AuthProvider } from "./lib/auth.jsx";
import "./styles.css";

import EventPage from "./pages/EventPage.jsx";
import GalleryPage from "./pages/GalleryPage.jsx";
import Admin from "./pages/Admin.jsx";
import SlideshowPage from "./pages/SlideshowPage.jsx";
import Legal from "./pages/Legal.jsx";
import Dashboard from "./pages/Dashboard.jsx";

// The marketing/landing page is served as a static file at the site root by
// Netlify (public/landing.html -> "/"), so React only owns the real app
// routes below. A hit to an unknown path falls through to the static landing
// page via the netlify.toml rewrite, so there is no in-app redirect to run.
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/e/:code" element={<EventPage />} />
            <Route path="/g/:contributorId" element={<GalleryPage />} />
            <Route path="/live/:code" element={<SlideshowPage />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/legal" element={<Legal />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  </React.StrictMode>
);
