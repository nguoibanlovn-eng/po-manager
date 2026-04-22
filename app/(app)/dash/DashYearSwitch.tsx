"use client";
import DashYearMobile, { type DashYearMobileProps } from "./DashYearMobile";
export default function DashYearSwitch({ mobileProps }: { mobileProps: DashYearMobileProps }) {
  return <div className="dash-mobile-only"><DashYearMobile {...mobileProps} /></div>;
}
