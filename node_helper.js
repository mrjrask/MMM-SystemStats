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
        let stats = {
            cpuUsage: this.getCpuUsage(),
            cpuTemp: this.getCpuTemp(),
            totalRam: Math.round(os.totalmem() / (1024 * 1024)),
            freeRam: Math.round(os.freemem() / (1024 * 1024))
        };

        this.sendSocketNotification("SYSTEM_STATS", stats);
    },

    getCpuUsage: function() {
        let cpus = os.cpus();
        return cpus.map((cpu) => {
            let total = 0;
            for (let type in cpu.times) {
                total += cpu.times[type];
            }
            return Math.round(((total - cpu.times.idle) / total) * 100);
        });
    },

    getCpuTemp: function() {
        return new Promise((resolve, reject) => {
            exec("/opt/vc/bin/vcgencmd measure_temp", (err, stdout) => {
                if (err) reject(err);
                resolve(parseFloat(stdout.split("=")[1]));
            });
        });
    }
});
