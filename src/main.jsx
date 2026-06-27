import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./styles.css";

import Home from "./pages/Home.jsx";
import EventPage from "./pages/EventPage.jsx";
import GalleryPage from "./pages/GalleryPage.jsx";
import Admin from "./pages/Admin.jsx";
import SlideshowPage from "./pages/SlideshowPage.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/e/:code" element={<EventPage />} />
        <Route path="/g/:contributorId" element={<GalleryPage />} />
        <Route path="/live/:code" element={<SlideshowPage />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
