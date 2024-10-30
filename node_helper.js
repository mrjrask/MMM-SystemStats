const NodeHelper = require("node_helper");
const { exec } = require("child_process");
const os = require("os");
const fs = require("fs");

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node_helper for: " + this.name);
        this.lastIdle = [];
        this.lastTotal = [];
    },

    socketNotificationReceived: function(notification) {
        if (notification === "GET_CPU_USAGE") {
            this.getPerCoreCpuUsage();
        }
        if (notification === "GET_CPU_TEMP") {
            this.getCpuTempAndRam();
        }
        if (notification === "GET_RAM_USAGE") {
            this.getRamUsage();
        }
        if (notification === "GET_DISK_USAGE") {
            this.getDiskUsage();
        }
    },

    // Function to calculate per-core CPU usage from /proc/stat
    getPerCoreCpuUsage: function() {
        fs.readFile('/proc/stat', 'utf8', (err, data) => {
            if (err) {
                console.error("Error reading /proc/stat:", err);
                return;
            }

            const lines = data.split('\n');
            const cpuUsages = [];

            for (let i = 0; i < 4; i++) {
                const cpuData = lines[i + 1].replace(/ +/g, ' ').split(' ');
                const idle = parseInt(cpuData[4]);
                const total = cpuData.slice(1, 8).reduce((acc, val) => acc + parseInt(val), 0);

                if (!this.lastIdle[i]) {
                    this.lastIdle[i] = idle;
                    this.lastTotal[i] = total;
                }

                const idleDiff = idle - this.lastIdle[i];
                const totalDiff = total - this.lastTotal[i];
                const cpuUsage = Math.round(100 * (1 - idleDiff / totalDiff));

                this.lastIdle[i] = idle;
                this.lastTotal[i] = total;

                cpuUsages.push(cpuUsage);
            }

            this.sendSocketNotification("CPU_USAGE", { cpuUsages });
        });
    },

    // Function to get CPU temperature and RAM usage
    getCpuTempAndRam: function() {
        fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8', (err, data) => {
            if (err) {
                console.error("Error reading fallback CPU temperature:", err);
                this.sendSocketNotification("CPU_TEMP", { cpuTemp: "N/A", cpuTempF: "N/A" });
            } else {
                const tempC = parseFloat(data) / 1000; // Convert millidegree to degree Celsius
                const tempF = (tempC * 9/5) + 32;      // Convert Celsius to Fahrenheit
                if (isNaN(tempC)) {
                    console.error("Error parsing fallback CPU temperature.");
                    this.sendSocketNotification("CPU_TEMP", { cpuTemp: "N/A", cpuTempF: "N/A" });
                } else {
                    this.sendSocketNotification("CPU_TEMP", {
                        cpuTemp: tempC.toFixed(1),
                        cpuTempF: tempF.toFixed(1)
                    });
                }
            }
        });
    },

    // Function to calculate RAM usage
    getRamUsage: function() {
        const totalRamBytes = os.totalmem();
        const freeRamBytes = os.freemem();

        // Calculate Used RAM (Total - Free) and convert to GB
        const usedRamGB = (totalRamBytes - freeRamBytes) / (1024 * 1024 * 1024);
        const freeRamGB = freeRamBytes / (1024 * 1024 * 1024);

        this.sendSocketNotification("RAM_USAGE", {
            usedRam: usedRamGB.toFixed(2),
            freeRam: freeRamGB.toFixed(2)
        });
    },

    // Function to get Disk Usage using the "df" command
    getDiskUsage: function() {
        exec("df -h --output=source,size,avail,target /", (err, stdout, stderr) => {
            if (err) {
                console.error("Error fetching disk usage:", err);
                return;
            }

            const lines = stdout.trim().split('\n');
            if (lines.length >= 2) {
                const diskInfo = lines[1].replace(/ +/g, ' ').split(' ');
                const driveCapacity = diskInfo[1].replace("G", "GB");  // Fix to show "GB"
                const freeSpace = diskInfo[2].replace("G", "GB");      // Fix to show "GB"

                this.sendSocketNotification("DISK_USAGE", {
                    driveCapacity: driveCapacity,
                    freeSpace: freeSpace
                });
            }
        });
    }
});
