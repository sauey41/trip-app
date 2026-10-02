#!/bin/sh
# Check the certificate actually served to visitors through Cloudflare Tunnel.
set -eu

host="${HTTPS_HOST:-trip.beike.uno}"
warning_days="${WARNING_DAYS:-30}"
case "$warning_days" in
  ''|*[!0-9]*) echo "WARNING_DAYS must be a nonnegative integer" >&2; exit 2 ;;
esac

if ! end_date="$(timeout 20 openssl s_client -connect "$host:443" -servername "$host" </dev/null 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null)"; then
  echo "Could not read the HTTPS certificate for $host" >&2
  exit 1
fi
end_date="${end_date#notAfter=}"
expires_at="$(date -u -d "$end_date" +%s)"
now="$(date -u +%s)"
remaining_seconds=$((expires_at - now))
remaining_days=$((remaining_seconds / 86400))

if ! http_status="$(curl --silent --show-error --max-time 20 --output /dev/null --write-out '%{http_code}' "https://$host/healthz")"; then
  echo "HTTPS health check failed for $host" >&2
  exit 1
fi
printf '%s: certificate expires %s (%s days remaining), healthz HTTP %s\n' "$host" "$end_date" "$remaining_days" "$http_status"

if [ "$http_status" != 200 ]; then
  echo "HTTPS health check returned HTTP $http_status" >&2
  exit 1
fi
if [ "$remaining_seconds" -le "$((warning_days * 86400))" ]; then
  echo "HTTPS certificate expires within $warning_days days" >&2
  exit 1
fi
