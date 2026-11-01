import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';

// Opt-in only. Rootless port forwarding can report this container's own address.
export function parseTrustedProxies(setting = '', selfAddresses?: string[]): string[] | false {
  if (!setting.trim()) return false;
  const addresses = setting.split(',').flatMap((item) => {
    const value = item.trim();
    if (value !== 'self') return [value];
    return (selfAddresses ??= Object.values(networkInterfaces())
      .flatMap((interfaces) => interfaces || [])
      .filter((network) => !network.internal)
      .map((network) => network.address));
  });
  if (!addresses.length || addresses.some((address) => !isIP(address)))
    throw new Error('TRUST_PROXY_IPS must contain explicit IP addresses or self');
  return [...new Set(addresses)];
}
