const NodeHelper = require("node_helper");
const os = require("os");
const { exec } = require("child_process");

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node_helper for: " + this.name);
    },

    socketNotificationReceived: function(notification) {
        if (notification === "GET_SYSTEM_STATS") {
            this.getSystemStats();
        }
    },

    getSystemStats: function() {
        this.getCpuTemp().then((cpuTemp) => {
            let stats = {
                cpuUsage: this.getOverallCpuUsage(),
                cpuTemp: cpuTemp || "N/A",  // Better handling for the temperature
                totalRam: Math.round(os.totalmem() / (1024 * 1024)), // MB
                freeRam: Math.round(os.freemem() / (1024 * 1024)) // MB
            };
            this.sendSocketNotification("SYSTEM_STATS", stats);
        }).catch(err => {
            console.error("Error fetching CPU temperature:", err);
            let stats = {
                cpuUsage: this.getOverallCpuUsage(),
                cpuTemp: "N/A",  // Show "N/A" if temperature can't be retrieved
                totalRam: Math.round(os.totalmem() / (1024 * 1024)), // MB
                freeRam: Math.round(os.freemem() / (1024 * 1024)) // MB
            };
            this.sendSocketNotification("SYSTEM_STATS", stats);
        });
    },

    getOverallCpuUsage: function() {
        let cpus = os.cpus();
        let totalIdle = 0, totalTick = 0;

        cpus.forEach((cpu) => {
            for (let type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });

        let idle = totalIdle / cpus.length;
        let total = totalTick / cpus.length;
        return Math.round(100 * ((total - idle) / total)); // Overall CPU usage percentage
    },

    getCpuTemp: function() {
        return new Promise((resolve, reject) => {
            exec("/opt/vc/bin/vcgencmd measure_temp", (err, stdout) => {
                if (err) {
                    console.error("Error getting CPU temperature:", err);
                    reject(err);
                } else {
                    let temp = parseFloat(stdout.split("=")[1]);
                    resolve(temp);
                }
            });
        });
    }
});
