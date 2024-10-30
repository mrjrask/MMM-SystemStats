Module.register("MMM-SystemStats", {
    defaults: {
        cpuUpdateInterval: 1000,    // CPU usage and temperature update every 1 second
        ramUpdateInterval: 10000,   // RAM usage update every 10 seconds
        diskUpdateInterval: 60000,  // Disk usage update every 60 seconds

        // Configurable options to enable/disable specific metrics
        showCpuUsage: true,
        showCpuTempC: true,
        showCpuTempF: true,
        showRamUsage: true,
        showDiskUsage: true
    },

    start: function() {
        this.stats = {
            cpuUsages: [0, 0, 0, 0],  // For four CPU cores
            cpuTemp: "N/A",
            cpuTempF: "N/A",
            usedRam: 0,
            freeRam: 0,
            driveCapacity: "N/A",
            freeSpace: "N/A"
        };
        this.updateCpuStats();
        this.updateCpuTemp();
        this.updateRamStats();
        this.updateDiskUsage();
        this.scheduleCpuStatsUpdate();
        this.scheduleTempUpdate();
        this.scheduleRamUpdate();
        this.scheduleDiskUpdate();
    },

    updateCpuStats: function() {
        if (this.config.showCpuUsage) {
            this.sendSocketNotification("GET_CPU_USAGE");
        }
    },

    updateCpuTemp: function() {
        if (this.config.showCpuTempC || this.config.showCpuTempF) {
            this.sendSocketNotification("GET_CPU_TEMP");
        }
    },

    updateRamStats: function() {
        if (this.config.showRamUsage) {
            this.sendSocketNotification("GET_RAM_USAGE");
        }
    },

    updateDiskUsage: function() {
        if (this.config.showDiskUsage) {
            this.sendSocketNotification("GET_DISK_USAGE");
        }
    },

    scheduleCpuStatsUpdate: function() {
        setInterval(() => {
            this.updateCpuStats();
        }, this.config.cpuUpdateInterval);
    },

    scheduleTempUpdate: function() {
        setInterval(() => {
            this.updateCpuTemp();
        }, this.config.cpuUpdateInterval); // Use the same interval for CPU temp as CPU usage
    },

    scheduleRamUpdate: function() {
        setInterval(() => {
            this.updateRamStats();
        }, this.config.ramUpdateInterval);
    },

    scheduleDiskUpdate: function() {
        setInterval(() => {
            this.updateDiskUsage();
        }, this.config.diskUpdateInterval);
    },

    getDom: function() {
        let wrapper = document.createElement("div");
        wrapper.className = "system-stats";

        // CPU Usage Display (Per-Core)
        if (this.config.showCpuUsage) {
            for (let i = 0; i < 4; i++) {
                let cpuUsageWrapper = document.createElement("div");
                cpuUsageWrapper.className = "cpu-usage";
                let titleCpu = document.createElement("div");
                titleCpu.innerHTML = `Core ${i}: <strong>${this.stats.cpuUsages[i]}%</strong>`;
                let cpuBar = document.createElement("progress");
                cpuBar.value = this.stats.cpuUsages[i];
                cpuBar.max = 100;
                cpuUsageWrapper.appendChild(titleCpu);
                cpuUsageWrapper.appendChild(cpuBar);
                wrapper.appendChild(cpuUsageWrapper);
            }
        }

        // CPU Temperature Display (both Celsius and Fahrenheit)
        if (this.config.showCpuTempC || this.config.showCpuTempF) {
            let cpuTempWrapper = document.createElement("div");
            cpuTempWrapper.className = "cpu-temp
