"use client";
import DashMonthMobile, { type DashMonthMobileProps } from "./DashMonthMobile";
export default function DashMonthSwitch({ mobileProps }: { mobileProps: DashMonthMobileProps }) {
  return <div className="dash-mobile-only"><DashMonthMobile {...mobileProps} /></div>;
}
