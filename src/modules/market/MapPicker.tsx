"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Props {
  lat: number | null;
  lng: number | null;
  /** where to look first when no pin is placed yet (e.g. the chosen district) */
  fallback?: { lat: number; lng: number };
  onPick: (lat: number, lng: number) => void;
  label: string;
}

const DHAKA = { lat: 23.8103, lng: 90.4125 };

/** A brand-gradient pin drawn with CSS, so no marker image files are needed. */
const pin = L.divIcon({
  className: "",
  iconSize: [34, 44],
  iconAnchor: [17, 42],
  html: `<span style="display:block;width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:linear-gradient(135deg,#F413E6,#48BDFA);box-shadow:0 8px 18px -6px rgba(15,23,42,.55);border:3px solid #fff"></span><span style="position:absolute;left:12px;top:10px;width:10px;height:10px;border-radius:50%;background:#fff"></span>`,
});

/**
 * Interactive map: click anywhere or drag the pin to set the exact place. Tiles come from OpenStreetMap (free, no key).
 * The page keeps the coordinates in its own state; this component only reports clicks and drags.
 */
export default function MapPicker({ lat, lng, fallback, onPick, label }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    if (!box.current || map.current) return;
    const start = lat !== null && lng !== null ? { lat, lng } : fallback ?? DHAKA;
    const m = L.map(box.current, { center: [start.lat, start.lng], zoom: lat !== null ? 16 : fallback ? 11 : 10, scrollWheelZoom: false, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => pick.current(round(e.latlng.lat), round(e.latlng.lng)));
    // mouse-wheel zoom only after the map was clicked, so the page can still scroll past it
    m.on("focus", () => m.scrollWheelZoom.enable());
    m.on("blur", () => m.scrollWheelZoom.disable());
    map.current = m;
    setTimeout(() => m.invalidateSize(), 120); // the modal animates in: size is known only afterwards
    return () => { m.remove(); map.current = null; marker.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (lat === null || lng === null) { marker.current?.remove(); marker.current = null; return; }
    if (!marker.current) {
      marker.current = L.marker([lat, lng], { icon: pin, draggable: true, keyboard: true }).addTo(m);
      marker.current.on("dragend", () => { const p = marker.current!.getLatLng(); pick.current(round(p.lat), round(p.lng)); });
    } else marker.current.setLatLng([lat, lng]);
    m.setView([lat, lng], Math.max(m.getZoom(), 15), { animate: true });
  }, [lat, lng]);

  useEffect(() => {
    if (lat === null && fallback && map.current) map.current.setView([fallback.lat, fallback.lng], 11);
  }, [fallback?.lat, fallback?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={box} role="application" aria-label={label} tabIndex={0} className="relative z-0 h-64 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:h-72" />;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
