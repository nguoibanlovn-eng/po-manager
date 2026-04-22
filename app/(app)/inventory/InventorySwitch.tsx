"use client";
import InventoryMobile, { type InventoryMobileProps } from "./InventoryMobile";
export default function InventorySwitch({ mobileProps }: { mobileProps: InventoryMobileProps }) {
  return <div className="dash-mobile-only"><InventoryMobile {...mobileProps} /></div>;
}
