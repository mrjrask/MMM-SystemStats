const NodeHelper = require("node_helper");
const { exec } = require("child_process");
const os = require("os");

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
        const fs = require("fs");

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
        exec("/opt/vc/bin/vcgencmd measure_temp", (err, stdout, stderr) => {
            if (err || stderr || !stdout) {
                console.error("Error getting CPU temperature:", err || stderr);
                this.sendSocketNotification("CPU_TEMP", { cpuTemp: "N/A" });
                return;
            }

            // Log the output of vcgencmd to check if it's returning anything
            console.log("vcgencmd output:", stdout);

            const temp = parseFloat(stdout.split("=")[1]);
            if (isNaN(temp)) {
                console.error("Error parsing CPU temperature");
                this.sendSocketNotification("CPU_TEMP", { cpuTemp: "N/A" });
                return;
            }

            // Get RAM usage
            const totalRam = os.totalmem() / (1024 * 1024); // Convert to MB
            const freeRam = os.freemem() / (1024 * 1024); // Convert to MB

            // Log RAM values to check for any issues
            console.log("Total RAM (MB):", totalRam);
            console.log("Free RAM (MB):", freeRam);

            // Send CPU temperature and RAM details back to the frontend
            this.sendSocketNotification("CPU_TEMP", {
                cpuTemp: temp.toFixed(1),  // Round to 1 decimal place
                totalRam: totalRam.toFixed(2),  // Convert to GB, round to 2 decimal places
                freeRam: freeRam.toFixed(2)  // Convert to GB, round to 2 decimal places
            });
        });
    }
});
