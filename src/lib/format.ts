const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export const money = (v?: number | null, decimals = false) => (v == null || isNaN(v) ? "—" : (decimals ? inr2 : inr).format(v));
export const number = (v?: number | null) => (v == null || isNaN(v) ? "—" : num.format(v));

/** ₹ 12.5 L / ₹ 1.2 Cr compact (Indian). */
export function moneyShort(v?: number | null) {
  if (v == null || isNaN(v)) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2).replace(/\.00$/, "")} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2).replace(/\.00$/, "")} L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return `${sign}₹${a.toFixed(0)}`;
}

const dFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const dtFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });
const tFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

const toDate = (v?: string | Date | null) => (v ? new Date(v) : null);
export const date = (v?: string | Date | null) => {
  const d = toDate(v);
  return d && !isNaN(+d) ? dFmt.format(d) : "—";
};
export const dateTime = (v?: string | Date | null) => {
  const d = toDate(v);
  return d && !isNaN(+d) ? dtFmt.format(d) : "—";
};
export const time = (v?: string | Date | null) => {
  const d = toDate(v);
  return d && !isNaN(+d) ? tFmt.format(d) : "—";
};

export function relative(v?: string | Date | null) {
  const d = toDate(v);
  if (!d) return "—";
  const diff = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return date(d);
}

/** For <input type="date"> */
export function toInputDate(v?: string | Date | null) {
  const d = toDate(v);
  if (!d || isNaN(+d)) return "";
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
/** For <input type="datetime-local"> */
export function toInputDateTime(v?: string | Date | null) {
  const d = toDate(v);
  if (!d || isNaN(+d)) return "";
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export const isOverdue = (v?: string | Date | null) => {
  const d = toDate(v);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
};
export const isToday = (v?: string | Date | null) => {
  const d = toDate(v);
  return !!d && d.toDateString() === new Date().toDateString();
};

export const initials = (name?: string) =>
  (name || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export const fileSize = (b?: number) =>
  !b ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

export const mapsLink = (address?: string, loc?: { lat?: number; lng?: number } | null) =>
  loc?.lat && loc?.lng
    ? `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`
    : address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
      : undefined;

export const telLink = (p?: string) => (p ? `tel:${p.replace(/\s/g, "")}` : undefined);
export const waLink = (p?: string, text?: string) => {
  if (!p) return undefined;
  let d = p.replace(/\D/g, "");
  if (d.length === 10) d = "91" + d;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
};
