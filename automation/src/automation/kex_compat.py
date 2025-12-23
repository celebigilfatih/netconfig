"""
Minimal SSH KEX compatibility layer for Paramiko/Netmiko.

Scope: ONLY key-exchange (KEX) negotiation handling.
Security note: Enabling legacy KEX (SHA-1 based DH groups) weakens security.
This module enables legacy KEX per-connection and only as a fallback,
never modifying Paramiko globals permanently.
"""

from __future__ import annotations

import contextlib
import re
import socket
import threading
from typing import Any, Optional

import paramiko

# Legacy KEX algorithms required by some old devices.
# Order matters: prefer group14 over group1 (group1 is weaker).
LEGACY_KEX = [
    "diffie-hellman-group14-sha1",
    "diffie-hellman-group1-sha1",
]

_patch_lock = threading.RLock()


def _is_kex_failure(exc: BaseException) -> bool:
    """
    Detect KEX-specific negotiation failure.
    We match known Paramiko/OpenSSH messages that indicate no KEX overlap.
    """
    msg = str(exc).lower()
    patterns = [
        r"no matching key exchange method found",
        r"unable to negotiate.*key exchange",
        r"kex negotiation failed",
        r"key exchange negotiation failed",
        r"no matching kex",
    ]
    return any(re.search(p, msg) for p in patterns)


@contextlib.contextmanager
def _temporary_transport_kex_patch(legacy_kex: list[str]):
    """
    Temporarily patch paramiko.Transport to include legacy KEX in its
    per-connection security options. This is scoped and thread-protected.

    Security: This patch is applied only within the context manager and
    reverted afterwards, minimizing global impact. While active, any Transport
    created in this thread will include the legacy KEX list.
    """
    with _patch_lock:
        OriginalTransport = paramiko.Transport

        class LegacyKexTransport(OriginalTransport):  # type: ignore[misc]
            def __init__(self, *args: Any, **kwargs: Any) -> None:
                super().__init__(*args, **kwargs)
                try:
                    opts = self.get_security_options()
                    # Append legacy algorithms if missing (do not remove secure defaults).
                    kex = list(opts.kex)
                    for alg in legacy_kex:
                        if alg not in kex:
                            kex.append(alg)
                    opts.kex = kex
                except Exception:
                    # If Paramiko internals change, fail safe by leaving defaults intact.
                    pass

        paramiko.Transport = LegacyKexTransport  # type: ignore[assignment]
        try:
            yield
        finally:
            paramiko.Transport = OriginalTransport  # type: ignore[assignment]


def _paramiko_connect_default(
    host: str,
    port: int,
    username: str,
    password: Optional[str],
    pkey: Optional[paramiko.PKey],
    timeout: float,
    banner_timeout: float,
    auth_timeout: float,
    allow_agent: bool,
    look_for_keys: bool,
) -> tuple[paramiko.SSHClient, paramiko.Transport]:
    client = paramiko.SSHClient()
    # Operational convenience: accept unknown host keys once (caller can harden if needed).
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=host,
        port=port,
        username=username,
        password=password,
        pkey=pkey,
        timeout=timeout,
        banner_timeout=banner_timeout,
        auth_timeout=auth_timeout,
        allow_agent=allow_agent,
        look_for_keys=look_for_keys,
    )
    transport = client.get_transport()
    assert transport is not None
    return client, transport


def _paramiko_connect_with_legacy_kex(
    host: str,
    port: int,
    username: str,
    password: Optional[str],
    pkey: Optional[paramiko.PKey],
    timeout: float,
) -> tuple[paramiko.SSHClient, paramiko.Transport]:
    """
    Perform a manual Paramiko Transport handshake with legacy KEX explicitly allowed.

    Security: Legacy SHA-1 based DH groups are enabled only for this connection.
    """
    sock = socket.create_connection((host, port), timeout=timeout)
    transport = paramiko.Transport(sock)
    # Extend per-connection KEX proposals with legacy algorithms.
    try:
        opts = transport.get_security_options()
        kex = list(opts.kex)
        for alg in LEGACY_KEX:
            if alg not in kex:
                kex.append(alg)
        opts.kex = kex
    except Exception:
        # If unable to set, proceed; Paramiko may already include legacy KEX.
        pass

    transport.start_client(timeout=timeout)
    if pkey is not None:
        transport.auth_publickey(username, pkey)
    else:
        # Password auth is used only if provided; agent/keys are not relied upon here.
        transport.auth_password(username, password or "")

    client = paramiko.SSHClient()
    client._transport = transport  # type: ignore[attr-defined]
    return client, transport


def connect_with_kex_fallback(
    host: str,
    *,
    port: int = 22,
    username: str,
    password: Optional[str] = None,
    pkey: Optional[paramiko.PKey] = None,
    timeout: float = 8.0,
    banner_timeout: float = 8.0,
    auth_timeout: float = 8.0,
    allow_agent: bool = False,
    look_for_keys: bool = False,
    mode: str = "paramiko",
    # Netmiko support: set device_type to use Netmiko. Example: "hp_comware", "cisco_ios"
    netmiko_device_type: Optional[str] = None,
) -> Any:
    """
    Establish an SSH connection with KEX fallback.

    Behavior:
    - First attempt uses default secure client behavior.
    - On KEX mismatch, a second attempt is made enabling legacy KEX per-connection.

    mode:
      - "paramiko": returns (SSHClient, Transport)
      - "netmiko": returns a Netmiko ConnectHandler

    Security implications are documented inline; legacy KEX is used only when required.
    """
    if mode == "netmiko":
        if netmiko_device_type is None:
            raise ValueError("netmiko_device_type is required when mode='netmiko'")
        try:
            from netmiko import ConnectHandler  # lazy import
        except Exception as e:
            raise RuntimeError("Netmiko is not available") from e

        # First attempt: default Netmiko (Paramiko under the hood) with secure defaults.
        try:
            return ConnectHandler(
                device_type=netmiko_device_type,
                host=host,
                port=port,
                username=username,
                password=password,
                # Netmiko uses conn_timeout/banner_timeout/auth_timeout for connection phases.
                conn_timeout=timeout,
                banner_timeout=banner_timeout,
                auth_timeout=auth_timeout,
            )
        except Exception as e:
            if not _is_kex_failure(e):
                raise
            # Second attempt: temporarily patch Transport to include legacy KEX.
            with _temporary_transport_kex_patch(LEGACY_KEX):
                return ConnectHandler(
                    device_type=netmiko_device_type,
                    host=host,
                    port=port,
                    username=username,
                    password=password,
                    conn_timeout=timeout,
                    banner_timeout=banner_timeout,
                    auth_timeout=auth_timeout,
                )

    # Paramiko mode
    try:
        client, transport = _paramiko_connect_default(
            host=host,
            port=port,
            username=username,
            password=password,
            pkey=pkey,
            timeout=timeout,
            banner_timeout=banner_timeout,
            auth_timeout=auth_timeout,
            allow_agent=allow_agent,
            look_for_keys=look_for_keys,
        )
        return client, transport
    except Exception as e:
        if not _is_kex_failure(e):
            raise
        client, transport = _paramiko_connect_with_legacy_kex(
            host=host,
            port=port,
            username=username,
            password=password,
            pkey=pkey,
            timeout=timeout,
        )
        return client, transport
