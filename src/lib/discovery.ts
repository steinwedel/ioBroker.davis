/**
 * Local network discovery for Davis WeatherLink Live (WLL) devices.
 *
 * The WLL announces itself via mDNS/DNS-SD (Bonjour/Avahi/Zeroconf) using the
 * service name `_weatherlinklive._tcp.local.`, as documented at
 * https://weatherlink.github.io/weatherlink-live-local-api/discovery.html
 *
 * This module sends a PTR query for that service, then resolves the SRV/A/AAAA
 * records returned in the same (or a follow-up) mDNS response to a concrete
 * IP address and port for each device found.
 */

import mdns from 'multicast-dns';

/** Service name the WeatherLink Live announces itself under */
const SERVICE_NAME = '_weatherlinklive._tcp.local';

/** A WeatherLink Live device discovered on the local network */
export interface DiscoveredDevice {
    /** IPv4 address of the discovered WeatherLink Live */
    address: string;
    /** TCP/HTTP port of the discovered WeatherLink Live (normally 80) */
    port: number;
    /** mDNS instance name, e.g. "weatherlinklive-700008.local" */
    name: string;
}

/**
 * Discovers WeatherLink Live devices on the local network via mDNS.
 *
 * @param adapter - Adapter instance used for setTimeout/clearTimeout
 * @param timeoutMs - How long to listen for responses before returning the results collected so far
 * @returns All discovered devices (deduplicated by address), or an empty array if none responded in time
 */
export function discoverWeatherLinkLive(adapter: ioBroker.Adapter, timeoutMs = 5000): Promise<DiscoveredDevice[]> {
    return new Promise(resolve => {
        const mdnsInstance = mdns();
        const found = new Map<string, DiscoveredDevice>();
        // Instance name -> port, filled in from SRV records that may arrive
        // in a separate packet than the PTR/A records for the same device.
        const pendingPorts = new Map<string, number>();

        const onResponse = (response: mdns.ResponsePacket): void => {
            const answers = [...response.answers, ...(response.additionals ?? [])];

            for (const answer of answers) {
                if (answer.type === 'SRV' && answer.name.startsWith('weatherlinklive')) {
                    pendingPorts.set(answer.name, answer.data.port);
                }
            }

            for (const answer of answers) {
                if (answer.type !== 'A' || !answer.name.startsWith('weatherlinklive')) {
                    continue;
                }
                const address = answer.data;
                if (found.has(address)) {
                    continue;
                }
                found.set(address, {
                    address,
                    port: pendingPorts.get(answer.name) ?? 80,
                    name: answer.name,
                });
            }
        };

        const finish = (): void => {
            mdnsInstance.removeListener('response', onResponse);
            mdnsInstance.destroy(() => resolve(Array.from(found.values())));
        };

        const timer = adapter.setTimeout(finish, timeoutMs);

        mdnsInstance.on('response', onResponse);
        mdnsInstance.on('error', () => {
            // Ignore socket errors (e.g. multicast unsupported on this network);
            // discovery simply returns whatever was found (possibly nothing) once the timeout fires.
        });

        mdnsInstance.query({
            questions: [{ type: 'PTR', name: SERVICE_NAME }],
        });

        // Cleanup safety net in case something goes wrong before the timer fires
        mdnsInstance.once('close', () => adapter.clearTimeout(timer));
    });
}
