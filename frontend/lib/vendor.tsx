import { Shield, Server as ServerIcon, Wifi } from "lucide-react";

export function vendorToneClasses(slug: string): string {
  if (slug === "fortigate") return "bg-orange-100 text-orange-700 border-orange-200";
  if (slug === "cisco_ios") return "bg-blue-100 text-blue-700 border-blue-200";
  if (slug === "mikrotik") return "bg-teal-100 text-teal-700 border-teal-200";
  return "bg-muted";
}

export function vendorIcon(slug: string) {
  if (slug === "fortigate") return <Shield className="h-3 w-3" />;
  if (slug === "cisco_ios") return <ServerIcon className="h-3 w-3" />;
  if (slug === "mikrotik") return <Wifi className="h-3 w-3" />;
  return null;
}

