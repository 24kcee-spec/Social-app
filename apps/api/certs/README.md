# Supabase database root CA

`supabase-root-ca.crt` is the public Supabase Root 2021 CA, valid through 26 April 2031. It is trusted only for Supabase database/pooler hostnames, alongside Node's standard roots; certificate-chain and hostname verification stay enabled. An explicit `DATABASE_CA_CERT_PATH` overrides the bundled provider trust when necessary.

Authoritative source: Supabase's dashboard [certificate download configuration](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json), key `ssl:certificate_url`, production environment:

https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

Downloaded over verified HTTPS on 24 October 2026. File SHA-256: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.

Certificate SHA-256 fingerprint: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

Review and verify a replacement against the official dashboard source before expiry; never substitute an untrusted certificate or disable verification to restore connectivity.
