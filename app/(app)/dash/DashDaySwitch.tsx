"use client";

import { useEffect, useState } from "react";
import DashDayMobile, { type DashDayMobileProps } from "./DashDayMobile";

/**
 * On mobile: renders DashDayMobile and hides the desktop content via CSS.
 * On desktop: renders nothing (desktop content shows normally).
 * This avoids having to pass 900 lines of JSX as a prop.
 */
export default function DashDaySwitch({ mobileProps }: { mobileProps: DashDayMobileProps }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!isMobile) return null;

  // On mobile: render mobile UI and hide the rest of the section
  return (
    <>
      <style>{`
        #dash-day > *:not(:first-child) { display: none !important; }
        #dash-day { padding: 0 !important; margin: 0 !important; }
        #main { padding: 0 !important; }
      `}</style>
      <DashDayMobile {...mobileProps} />
    </>
  );
}
