import React from "react";
import { C } from "../../lib/score.js";
import { useI18n } from "../../lib/i18n.jsx";

// Shown under the "Video guestbook" switch while it's on.
export default function VideoGuestbookSettings() {
  const { t } = useI18n();
  return (
    <p data-testid="vgb-setting" style={{ fontSize: 11.5, color: C.second, lineHeight: 1.5, margin: 0 }}>{t("vgb.setting")}</p>
  );
}
