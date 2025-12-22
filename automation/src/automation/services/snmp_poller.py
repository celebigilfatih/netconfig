import os
from typing import Any, Dict, List, Optional, Tuple

try:
  from pysnmp.hlapi import (
    SnmpEngine,
    CommunityData,
    UsmUserData,
    UdpTransportTarget,
    ContextData,
    ObjectType,
    ObjectIdentity,
    getCmd,
    nextCmd,
    usmHMACSHAAuthProtocol,
    usmHMACMD5AuthProtocol,
    usmDESPrivProtocol,
    usmAesCfb128Protocol,
  )
except Exception:
  try:
    from pysnmp.hlapi.v3arch import (
      SnmpEngine,
      UsmUserData,
      UdpTransportTarget,
      ContextData,
      ObjectType,
      ObjectIdentity,
      getCmd,
      nextCmd,
      usmHMACSHAAuthProtocol,
      usmHMACMD5AuthProtocol,
      usmDESPrivProtocol,
      usmAesCfb128Protocol,
    )
    from pysnmp.hlapi.v1arch import CommunityData
  except Exception:
    class SnmpEngine: pass
    def CommunityData(*args, **kwargs): return None
    def UsmUserData(*args, **kwargs): return None
    def UdpTransportTarget(*args, **kwargs): return None
    def ContextData(*args, **kwargs): return None
    def ObjectType(*args, **kwargs): return None
    def ObjectIdentity(*args, **kwargs): return None
    def getCmd(*args, **kwargs):
      class _Iter:
        def __iter__(self): return self
        def __next__(self): raise StopIteration
      return _Iter()
    def nextCmd(*args, **kwargs):
      yield (None, None, None, [])
    usmHMACSHAAuthProtocol = None
    usmHMACMD5AuthProtocol = None
    usmDESPrivProtocol = None
    usmAesCfb128Protocol = None

from automation.clients.api_client import ApiClient
from automation.snmp.vendor_oids import (
  UPTIME_OID,
  CPU_TABLE_OID,
  MEM_TOTAL_OID,
  MEM_AVAIL_OID,
  INVENTORY_MODEL_OID,
  INVENTORY_SERIAL_OID,
  vendor_specific_inventory_oids,
)


def _map_auth_protocol(name: Optional[str]):
  n = (name or "sha").lower()
  if n == "md5":
    return usmHMACMD5AuthProtocol
  return usmHMACSHAAuthProtocol


def _map_priv_protocol(name: Optional[str]):
  n = (name or "aes").lower()
  if n == "des":
    return usmDESPrivProtocol
  return usmAesCfb128Protocol


def _build_security(v3: Optional[Dict[str, Any]], community: Optional[str]) -> Tuple[Any, Any]:
  if v3 and v3.get("username"):
    user = UsmUserData(
      v3["username"],
      authKey=v3.get("authKey"),
      authProtocol=_map_auth_protocol(v3.get("authProtocol")),
      privKey=v3.get("privKey"),
      privProtocol=_map_priv_protocol(v3.get("privProtocol")),
    )
    return (SnmpEngine(), user)
  return (SnmpEngine(), CommunityData(community or "public", mpModel=1))


def snmp_get(engine: Any, security: Any, host: str, oid: str, timeout: int, retries: int) -> Optional[Any]:
  try:
    iterator = getCmd(
      engine,
      security,
      UdpTransportTarget((host, 161), timeout=timeout, retries=retries),
      ContextData(),
      ObjectType(ObjectIdentity(oid)),
    )
    try:
      errorIndication, errorStatus, errorIndex, varBinds = next(iterator)
    except Exception:
      return None
    if errorIndication or errorStatus:
      return None
    for name, val in varBinds:
      return val
    return None
  except Exception:
    return None


def snmp_walk(engine: Any, security: Any, host: str, oid: str, timeout: int, retries: int) -> List[Any]:
  rows: List[Any] = []
  try:
    for (errorIndication, errorStatus, errorIndex, varBinds) in nextCmd(
      engine,
      security,
      UdpTransportTarget((host, 161), timeout=timeout, retries=retries),
      ContextData(),
      ObjectType(ObjectIdentity(oid)),
      lexicographicMode=False,
    ):
      if errorIndication or errorStatus:
        break
      for name, val in varBinds:
        rows.append((str(name), val))
  except Exception:
    return rows
  return rows


def poll_device(client: ApiClient, device: Dict[str, Any], timeout: int, retries: int) -> None:
  device_id = device["id"]
  tenant_id = device["tenant_id"]
  host = str(device.get("mgmt_ip"))
  vendor = str(device.get("vendor"))
  cfg = client.get_snmp_config(device_id)
  community = cfg.get("community")
  v3 = cfg.get("v3")
  engine, security = _build_security(v3, community)

  uptime_ticks: Optional[int] = None
  v = snmp_get(engine, security, host, UPTIME_OID, timeout, retries)
  if v is not None:
    try:
      uptime_ticks = int(v)
    except Exception:
      uptime_ticks = None

  cpu_percent: Optional[int] = None
  cpu_rows = snmp_walk(engine, security, host, CPU_TABLE_OID, timeout, retries)
  cpu_vals: List[int] = []
  for _, val in cpu_rows:
    try:
      cpu_vals.append(int(val))
    except Exception:
      continue
  if cpu_vals:
    cpu_percent = round(sum(cpu_vals) / len(cpu_vals))

  mem_used_percent: Optional[int] = None
  tot = snmp_get(engine, security, host, MEM_TOTAL_OID, timeout, retries)
  av = snmp_get(engine, security, host, MEM_AVAIL_OID, timeout, retries)
  try:
    total = int(tot) if tot is not None else None
    avail = int(av) if av is not None else None
    if total and avail and total > 0:
      used = total - avail
      mem_used_percent = max(0, min(100, round(used * 100 / total)))
  except Exception:
    mem_used_percent = None

  if uptime_ticks is None and cpu_percent is None and mem_used_percent is None:
    uptime_ticks = 0
    cpu_percent = 0
    mem_used_percent = 0
  client.report_metrics(tenant_id, device_id, uptime_ticks, cpu_percent, mem_used_percent)

  model: Optional[str] = None
  serial: Optional[str] = None
  firmware: Optional[str] = None

  model_rows = snmp_walk(engine, security, host, INVENTORY_MODEL_OID, timeout, retries)
  for _, val in model_rows:
    s = str(val).strip()
    if s:
      model = s
      break

  serial_rows = snmp_walk(engine, security, host, INVENTORY_SERIAL_OID, timeout, retries)
  for _, val in serial_rows:
    s = str(val).strip()
    if s:
      serial = s
      break

  fw_oid, serial_vendor_oid = vendor_specific_inventory_oids(vendor)
  if fw_oid:
    v = snmp_get(engine, security, host, fw_oid, timeout, retries)
    if v is not None:
      s = str(v).strip()
      if s:
        firmware = s
  if serial_vendor_oid and not serial:
    v = snmp_get(engine, security, host, serial_vendor_oid, timeout, retries)
    if v is not None:
      s = str(v).strip()
      if s:
        serial = s

  client.report_inventory(tenant_id, device_id, model, firmware, serial)


def run_once() -> None:
  api_base_url = os.environ.get("API_BASE_URL", "http://127.0.0.1:3001")
  api_token = os.environ["AUTOMATION_SERVICE_TOKEN"]
  timeout = int(os.environ.get("SNMP_TIMEOUT_SECONDS", "2"))
  retries = int(os.environ.get("SNMP_RETRIES", "1"))
  batch_limit = int(os.environ.get("SNMP_POLL_BATCH_LIMIT", "50"))
  client = ApiClient(api_base_url, api_token)
  devices = client.list_active_devices(limit=batch_limit, offset=0)
  for d in devices:
    try:
      poll_device(client, d, timeout, retries)
    except Exception:
      continue


def main_loop() -> None:
  import time
  interval = int(os.environ.get("SNMP_POLL_INTERVAL_SECONDS", "300"))
  while True:
    run_once()
    time.sleep(interval)


if __name__ == "__main__":
  mode = os.environ.get("SNMP_POLLER_MODE", "once")
  if mode == "loop":
    main_loop()
  else:
    run_once()
