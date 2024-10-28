const NodeHelper = require("node_helper");
const { exec } = require("child_process");
const os = require("os");
const fs = require("fs");

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node_helper for: " + this.name);
        this.lastTotal = 0;
        this.lastIdle = 0;
    },

    socketNotificationReceived: function(notification) {
        if (notification === "GET_CPU_USAGE") {
            this.getCpuUsage();
        }
        if (notification === "GET_CPU_TEMP") {
            this.getCpuTempAndRam();
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
                const temp = parseFloat(data) / 1000; // Convert millidegree to degree
                if (isNaN(temp)) {
                    console.error("Error parsing fallback CPU temperature.");
                    this.sendSocketNotification("CPU_TEMP", { cpuTemp: "N/A" });
                } else {
                    this.sendCpuTempAndRam(temp.toFixed(1));
                }
            }
        });
    },

    // Helper function to send CPU temp and RAM values (now calculating Used and Free memory)
    sendCpuTempAndRam: function(cpuTemp) {
        const totalRamBytes = os.totalmem();
        const freeRamBytes = os.freemem();

        // Calculate Used RAM (Total - Free) and convert to GB
        const usedRamGB = (totalRamBytes - freeRamBytes) / (1024 * 1024 * 1024);
        const freeRamGB = freeRamBytes / (1024 * 1024 * 1024);

        // Log the RAM values for debugging purposes
        console.log("Used RAM (GB):", usedRamGB);
        console.log("Free RAM (GB):", freeRamGB);

        // Check for NaN values and handle them gracefully
        if (isNaN(usedRamGB) || isNaN(freeRamGB)) {
            console.error("Error fetching RAM information.");
            this.sendSocketNotification("CPU_TEMP", { cpuTemp, usedRam: "N/A", freeRam: "N/A" });
        } else {
            this.sendSocketNotification("CPU_TEMP", {
                cpuTemp,
                usedRam: usedRamGB.toFixed(2),
                freeRam: freeRamGB.toFixed(2)
            });
        }
    }
});
