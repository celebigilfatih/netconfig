UPTIME_OID = "1.3.6.1.2.1.1.3.0"
CPU_TABLE_OID = "1.3.6.1.2.1.25.3.3.1.2"
MEM_TOTAL_OID = "1.3.6.1.4.1.2021.4.5.0"
MEM_AVAIL_OID = "1.3.6.1.4.1.2021.4.6.0"

INVENTORY_MODEL_OID = "1.3.6.1.2.1.47.1.1.1.1.13"
INVENTORY_SERIAL_OID = "1.3.6.1.2.1.47.1.1.1.1.11"

FORTIGATE_FW_OID = "1.3.6.1.4.1.12356.101.4.1.1.0"
FORTIGATE_SERIAL_OID = "1.3.6.1.4.1.12356.101.4.1.3.0"

MIKROTIK_FW_OID = "1.3.6.1.4.1.14988.1.1.4.3.0"
MIKROTIK_SERIAL_OID = "1.3.6.1.4.1.14988.1.1.7.3.0"

def vendor_specific_inventory_oids(vendor: str) -> tuple[str | None, str | None]:
  v = (vendor or "").lower()
  if v == "fortigate":
    return (FORTIGATE_FW_OID, FORTIGATE_SERIAL_OID)
  if v == "mikrotik":
    return (MIKROTIK_FW_OID, MIKROTIK_SERIAL_OID)
  return (None, None)
