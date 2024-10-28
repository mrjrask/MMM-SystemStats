const NodeHelper = require("node_helper");
const { exec } = require("child_process");
const os = require("os");
const fs = require("fs");

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node_helper for: " + this.name);
    },

    socketNotificationReceived: function(notification) {
        if (notification === "GET_CPU_USAGE") {
            this.getCpuUsage();
        }
        if (notification === "GET_CPU_TEMP") {
            this.getCpuTempAndRam();
        }
        if (notification === "GET_RAM_USAGE") {
            this.getRamUsage();
        }
    },

    // Function to calculate CPU usage from /proc/stat
    getCpuUsage: function() {
        fs.readFile('/proc/stat', 'utf8', (err, data) => {
            if (err) {
                console.error("Error reading /proc/stat:", err);
                return;
            }

            const cpuData = data.split('\n')[0].replace(/ +/g, ' ').split(' ');
            const idle = parseInt(cpuData[4]);
            const total = cpuData.slice(1, 8).reduce((acc, val) => acc + parseInt(val), 0);

            const idleDiff = idle - this.lastIdle;
            const totalDiff = total - this.lastTotal;

            const cpuUsage = Math.round(100 * (1 - idleDiff / totalDiff));

            this.lastIdle = idle;
            this.lastTotal = total;

            this.sendSocketNotification("CPU_USAGE", { cpuUsage });
        });
    },

    // Function to get CPU temperature and RAM usage
    getCpuTempAndRam: function() {
        fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8', (err, data) => {
            if (err) {
                console.error("Error reading fallback CPU temperature:", err);
                this.sendSocketNotification("CPU_TEMP", { cpuTemp: "N/A" });
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
    }
});
