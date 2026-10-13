# Redis runtime compatibility

The existing production Site has a secret named `REDIS` (environment revision 7).
Its value is masked by Sites; null metadata is not evidence that it is unset.
Redis Cloud database 14687836 was inspected in Patrick's existing Chrome session.
It exposes Redis TCP/RESP, with RESP3 selected. Patrick approved the single TLS
Off → On change; the saved configuration was verified with mutual TLS off.
No credentials, ACLs, network rules or plans were changed.

The current Sites skill runtime contract explicitly says external connections are
HTTP-based and raw TCP is unavailable. This is narrower than general Cloudflare
Workers support for outbound sockets. The Redis Cloud database endpoint must not
be passed to `fetch` or treated as a Redis-over-HTTP service. The Redis Cloud
management REST API is not a data-plane replacement.

Authenticated PING and certificate-chain compatibility are unverified. There is
no supported private execution path for this TCP binding in the current Sites
runtime, and the secret must remain server-only. Do not add a public diagnostic,
copy the secret locally, disable certificate validation, or provision a proxy.
The smallest next step is confirmation from Sites of a supported TCP transport,
or use of the separately hosted authoritative game server already specified by
the official architecture when that infrastructure is approved.

D1 gameplay work does not depend on Redis. Redis's intended future responsibilities
are ephemeral presence, gateway fan-out, rate limits and revocation broadcasts;
ledgers, counted civic actions and long-lived timers require durable records.

Sources: [Harimu architecture](https://docs.harimu.com/tech/architecture/),
[Redis Cloud TLS](https://redis.io/docs/latest/operate/rc/security/database-security/tls-ssl/),
[general Workers TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/).
