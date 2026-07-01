import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { I18nProvider } from "./lib/i18n.jsx";
import "./styles.css";

import Home from "./pages/Home.jsx";
import EventPage from "./pages/EventPage.jsx";
import GalleryPage from "./pages/GalleryPage.jsx";
import Admin from "./pages/Admin.jsx";
import SlideshowPage from "./pages/SlideshowPage.jsx";
import Legal from "./pages/Legal.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/e/:code" element={<EventPage />} />
          <Route path="/g/:contributorId" element={<GalleryPage />} />
          <Route path="/live/:code" element={<SlideshowPage />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>
);
