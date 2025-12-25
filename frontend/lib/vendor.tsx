import { Shield, Server as ServerIcon, Wifi } from "lucide-react";

export function vendorToneClasses(slug: string): string {
  if (slug === "fortigate") return "bg-orange-100 text-orange-700 border-orange-200";
  if (slug === "cisco_ios") return "bg-blue-100 text-blue-700 border-blue-200";
  if (slug === "mikrotik") return "bg-teal-100 text-teal-700 border-teal-200";
  if (slug === "hp_comware") return "bg-yellow-100 text-yellow-700 border-yellow-200";
  if (slug === "hp_procurve") return "bg-yellow-100 text-yellow-700 border-yellow-200";
  if (slug === "aruba_aos_s") return "bg-green-100 text-green-700 border-green-200";
  if (slug === "aruba_aoscx") return "bg-lime-100 text-lime-700 border-lime-200";
  if (slug === "dell_powerconnect") return "bg-slate-100 text-slate-700 border-slate-200";
  if (slug === "extreme_xos") return "bg-purple-100 text-purple-700 border-purple-200";
  if (slug === "dlink") return "bg-cyan-100 text-cyan-700 border-cyan-200";
  if (slug === "tplink") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (slug === "ruijie") return "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200";
  if (slug === "allied_telesis") return "bg-amber-100 text-amber-700 border-amber-200";
  if (slug === "h3c") return "bg-red-100 text-red-700 border-red-200";
  if (slug === "brocade_icx") return "bg-rose-100 text-rose-700 border-rose-200";
  if (slug === "ubiquiti_unifi") return "bg-sky-100 text-sky-700 border-sky-200";
  return "bg-muted";
}

export function vendorIcon(slug: string) {
  if (slug === "fortigate") return <Shield className="h-3 w-3" />;
  if (slug === "cisco_ios") return <ServerIcon className="h-3 w-3" />;
  if (slug === "mikrotik") return <Wifi className="h-3 w-3" />;
  if (slug === "hp_comware") return <ServerIcon className="h-3 w-3" />;
  if (slug === "hp_procurve") return <ServerIcon className="h-3 w-3" />;
  return <ServerIcon className="h-3 w-3" />;
}

