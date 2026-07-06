# MMM-SystemStats

A MagicMirror module that displays CPU usage, CPU temperature, memory usage, disk capacity, fan speed, and ping latency in real time.

## Config Example

```js
{
  module: "MMM-SystemStats",
  position: "top_right",
  config: {
    cpuUpdateInterval: 1000,
    ramUpdateInterval: 10000,
    diskUpdateInterval: 60000,

    cpuTempPath: "/sys/class/thermal/thermal_zone0/temp",
    diskMount: "/",

    fanUpdateInterval: 10000,
    fanHwmonPath: "",

    showCpuUsage: true,
    showCpuTempC: true,
    showCpuTempF: true,
    showRamUsage: true,
    showDiskUsage: true,
    showFanSpeed: true,
    showPing: true,

    pingHost: "1.1.1.1",
    pingCount: 1,
    pingIntervalMin: 10,
    pingIntervalMax: 30
  }
}
```

## Configuration Options

| Option | Default | Description |
| --- | --- | --- |
| `cpuUpdateInterval` | `1000` | CPU usage and CPU temperature polling interval in milliseconds. Values below `500` are raised to `500`. |
| `ramUpdateInterval` | `10000` | RAM polling interval in milliseconds. Values below `1000` are raised to `1000`. |
| `diskUpdateInterval` | `60000` | Disk polling interval in milliseconds. Values below `10000` are raised to `10000`. |
| `cpuTempPath` | `"/sys/class/thermal/thermal_zone0/temp"` | Preferred Linux temperature sensor path. If unavailable, the helper falls back to `/sys/class/hwmon` discovery. |
| `diskMount` | `"/"` | Filesystem path to inspect with `df`, such as `/`, `/home`, or an external drive mount. |
| `fanUpdateInterval` | `10000` | Fan tachometer polling interval in milliseconds. Values below `1000` are raised to `1000`. |
| `fanHwmonPath` | `""` | Optional explicit `/sys/class/hwmon/.../fan*_input` path. When empty, the helper tries to discover a fan input automatically. |
| `showCpuUsage` | `true` | Show or hide CPU usage. |
| `showCpuTempC` | `true` | Show or hide CPU temperature in Celsius. |
| `showCpuTempF` | `true` | Show or hide CPU temperature in Fahrenheit. |
| `showRamUsage` | `true` | Show or hide RAM usage. |
| `showDiskUsage` | `true` | Show or hide disk usage. |
| `showFanSpeed` | `true` | Show or hide fan speed when a fan tachometer can be read. |
| `showPing` | `true` | Show or hide ping latency and enable or disable ping polling. |
| `pingHost` | `"1.1.1.1"` | Hostname, IPv4 address, or IPv6 literal used for latency checks. Empty values fall back to `8.8.8.8`. |
| `pingCount` | `1` | Number of pings to send for each sample. When greater than `1`, the displayed value is the average. |
| `pingIntervalMin` | `10` | Minimum randomized ping interval in seconds. Values below `1` are raised to `1`. |
| `pingIntervalMax` | `30` | Maximum randomized ping interval in seconds. Values below `pingIntervalMin` are raised to the minimum. |

## Platform Notes

- CPU usage is read from `/proc/stat`, so it is intended for Linux systems.
- CPU temperature is usually read from `/sys/class/thermal/thermal_zone0/temp`; the module can also discover `temp*_input` files under `/sys/class/hwmon`.
- Fan telemetry is hardware-dependent and works only when a readable `fan*_input` tachometer file is available.
- Disk usage is read with the system `df` command for the configured `diskMount` path.
- Ping latency requires the system `ping` command to be installed and executable by the MagicMirror process.

## Development

Run the lightweight syntax check before submitting changes:

```sh
npm test
```
