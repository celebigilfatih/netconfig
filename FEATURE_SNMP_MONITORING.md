You are a senior network monitoring engineer and backend architect.

I already have a production network application that:
- Backs up network device configurations
- Uses a Python automation service
- Uses a Node.js API
- Uses a Next.js frontend
- Uses PostgreSQL

I want to EXTEND this existing application with a new FEATURE,
not build a new product.

========================
FEATURE NAME
========================
SNMP-Based Network Monitoring & Alarm Feature

========================
GOAL
========================
Extend the existing application so it can:

- Read SNMP data from switches and routers
- Monitor interface status (port up/down)
- Monitor device health (CPU, memory, uptime)
- Collect basic hardware/inventory information
- Generate alarms
- Display alarms and device status in the existing UI

========================
IMPORTANT CONSTRAINT
========================
This must be implemented as:
- An additional module / feature
- Reusing existing services
- No new standalone product
- No breaking changes to current functionality

========================
TECHNOLOGY REQUIREMENTS
========================
SNMP & Monitoring:
- Python 3.11
- pysnmp
- SNMP v2c and SNMP v3
- Polling-based monitoring (MVP)
- Trap support planned for future versions

Backend:
- Existing Node.js API
- New endpoints only for monitoring and alarms

Frontend:
- Existing Next.js application
- New pages/components only (Alarm Dashboard, Device Status)

Database:
- Existing PostgreSQL database
- New tables allowed (alarms, metrics)

========================
ARCHITECTURE EXTENSION
========================
Extend the existing Python Automation Service to include:

- SNMP Poller module
- Alarm Engine module

Existing services must remain unchanged.

========================
SNMP DATA COLLECTION
========================
Polling intervals:
- Interface status: every 30 seconds
- CPU / Memory: every 5 minutes
- Hardware / Inventory: every 1 hour

Collected data:
- Interface name, admin status, oper status
- Device uptime
- CPU usage (vendor-specific)
- Memory usage (vendor-specific)
- Device model, firmware, serial number

========================
VENDOR ABSTRACTION
========================
Implement vendor-independent logic.

Use a single OID mapping module that supports:
- Generic IF-MIB
- Cisco
- Fortinet
- MikroTik

Adding a new vendor must only require updating the OID mapping file.

========================
ALARM LOGIC
========================
Generate alarms when:
- Port admin status is UP but oper status is DOWN
- Device becomes unreachable
- CPU usage > 80%
- Memory usage > 80%

Alarm properties:
- type (interface, device, resource, hardware)
- severity (info, warning, critical)
- message
- acknowledged flag
- timestamp

========================
DATABASE EXTENSION
========================
Define new tables only if needed:
- alarms
- device_metrics (optional)

Do NOT modify existing tables unless absolutely required.

========================
PERFORMANCE & SCALABILITY
========================
- Initial implementation: synchronous polling
- Design must allow future async polling using asyncio
- Design must be SaaS / multi-tenant ready

========================
DELIVERABLES
========================
1. Description of how this feature integrates into the existing application
2. Technology list used by this feature
3. SNMP Poller module structure
4. Vendor OID mapping structure
5. Alarm Engine logic
6. Database schema additions
7. Example API endpoints for alarms
8. Example UI data format for alarm display

========================
STYLE & QUALITY
========================
- Production-quality code
- Clear module boundaries
- No hardcoded credentials
- Secure SNMP handling
- Clear explanations focused on feature extension

Start by explaining:
1) How this feature fits into the existing system
2) What technologies are used and why
3) Then provide the technical structure
