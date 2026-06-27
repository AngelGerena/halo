import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase, publicUrl } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { Header, Footer, Spinner, Empty } from "../components/UI.jsx";
import { PhotoGrid } from "../components/PhotoGrid.jsx";

export default function GalleryPage() {
  const { contributorId } = useParams();
  const navigate = useNavigate();
  const [contributor, setContributor] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from("contributors").select("*").eq("id", contributorId).single();
      setContributor(c || false);
      if (c) {
        const { data } = await supabase.from("photos").select("*")
          .eq("contributor_id", contributorId).eq("kept", true)
          .order("created_at", { ascending: false });
        setPhotos((data || []).map((p) => ({ ...p, url: publicUrl(p.storage_path), edited_url: p.edited_path ? publicUrl(p.edited_path) : null })));
      }
      setLoading(false);
    })();
  }, [contributorId]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header />
      <main className="wrap" style={{ flex: 1 }}>
        {loading ? <Spinner label="Loading gallery…" /> :
          !contributor ? <Empty title="Gallery not found" sub="This share link may be invalid." action="Go home" onAction={() => navigate("/")} /> :
          <>
            <h1 className="serif" style={{ fontSize: 34, color: C.ink, marginBottom: 2 }}>{contributor.name}'s gallery</h1>
            <p style={{ color: C.second, marginTop: 0 }}>{photos.length} curated photo{photos.length === 1 ? "" : "s"}</p>
            {photos.length === 0 ? <Empty title="No photos yet" sub="Curated shots will appear here." /> : <PhotoGrid photos={photos} dimUnkept={false} />}
          </>}
      </main>
      <Footer />
    </div>
  );
}
