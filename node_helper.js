const NodeHelper = require("node_helper");
const { exec } = require("child_process");
const os = require("os");
const fs = require("fs");
const Gpio = require("onoff").Gpio;  // Import the onoff library for GPIO

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node_helper for: " + this.name);

        this.lastIdle = 0;
        this.lastTotal = 0;

        // Set up the RPM reading GPIO pin (Assuming tachometer pin is GPIO 13)
        this.fanRPM = 0;
        this.pulseCount = 0;
        this.RPM_GPIO = new Gpio(13, 'in', 'rising');  // GPIO 13 for RPM reading
        this.RPM_GPIO.watch((err, value) => {
            if (err) {
                console.error("Error reading RPM:", err);
                return;
            }
            this.pulseCount += 1;  // Increment pulse count on each rising edge
        });

        // Set an interval to calculate RPM
        this.calculateRPMInterval = setInterval(this.calculateRPM.bind(this), 5000);  // Calculate every 5 seconds
    },

    // Calculate RPM based on pulse count
    calculateRPM: function() {
        // Each pulse corresponds to half a revolution, so divide by 2
        const revolutions = this.pulseCount / 2;
        this.fanRPM = Math.round((revolutions / 5) * 60);  // Extrapolate to RPM
        this.pulseCount = 0;  // Reset pulse count after each calculation
        this.sendSocketNotification("FAN_RPM", { fanRPM: this.fanRPM });
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
        if (notification === "GET_DISK_USAGE") {
            this.getDiskUsage();
        }
    },

    // Function to calculate overall CPU usage
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

    // Other functions for CPU temp, RAM, and disk usage...

    stop: function() {
        // Clean up GPIO on exit
        if (this.RPM_GPIO) {
            this.RPM_GPIO.unexport();
        }
        clearInterval(this.calculateRPMInterval);
    }
});
