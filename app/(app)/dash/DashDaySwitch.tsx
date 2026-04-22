"use client";

import DashDayMobile, { type DashDayMobileProps } from "./DashDayMobile";

/**
 * Renders both mobile and desktop content. CSS media queries show/hide.
 * No JS detection needed — avoids flash of wrong layout.
 */
export default function DashDaySwitch({ mobileProps }: { mobileProps: DashDayMobileProps }) {
  return (
    <div className="dash-mobile-only">
      <DashDayMobile {...mobileProps} />
    </div>
  );
}
