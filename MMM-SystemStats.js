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
            cpuUsage: 0,
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

        // CPU Usage Display
        if (this.config.showCpuUsage) {
            let cpuUsageWrapper = document.createElement("div");
            cpuUsageWrapper.className = "cpu-usage";
            let titleCpu = document.createElement("div");
            titleCpu.innerHTML = `CPU Usage: <strong>${this.stats.cpuUsage}%</strong>`;
            let cpuBar = document.createElement("progress");
            cpuBar.value = this.stats.cpuUsage;
            cpuBar.max = 100;
            cpuUsageWrapper.appendChild(titleCpu);
            cpuUsageWrapper.appendChild(cpuBar);
            wrapper.appendChild(cpuUsageWrapper);
        }

        // CPU Temperature Display (both Celsius and Fahrenheit)
        if (this.config.showCpuTempC || this.config.showCpuTempF) {
            let cpuTempWrapper = document.createElement("div");
            cpuTempWrapper.className = "cpu-temp";
            let titleTemp = document.createElement("div");
            let tempText = `CPU Temp: <strong>`;
            if (this.config.showCpuTempC) {
                tempText += `${this.stats.cpuTemp}ºC`;
            }
            if (this.config.showCpuTempF) {
                tempText += ` / ${this.stats.cpuTempF}ºF`;
            }
            tempText += `</strong>`;
            titleTemp.innerHTML = tempText;
            cpuTempWrapper.appendChild(titleTemp);
            wrapper.appendChild(cpuTempWrapper);
        }

        // RAM Usage Display
        if (this.config.showRamUsage) {
            let ramUsageWrapper = document.createElement("div");
            ramUsageWrapper.className = "ram-usage";
            let titleRam = document.createElement("div");
            titleRam.innerHTML = `8GB RAM: <strong>Used: ${this.stats.usedRam}GB / Free: ${this.stats.freeRam}GB</strong>`;
            ramUsageWrapper.appendChild(titleRam);
            wrapper.appendChild(ramUsageWrapper);
        }

        // Disk Usage Display
        if (this.config.showDiskUsage) {
            let diskUsageWrapper = document.createElement("div");
            diskUsageWrapper.className = "disk-usage";
            let titleDisk = document.createElement("div");
            titleDisk.innerHTML = `Disk Usage: <strong>Free: ${this.stats.freeSpace} / Capacity: ${this.stats.driveCapacity}</strong>`;
            diskUsageWrapper.appendChild(titleDisk);
            wrapper.appendChild(diskUsageWrapper);
        }

        return wrapper;
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "CPU_USAGE") {
            this.stats.cpuUsage = payload.cpuUsage;
            this.updateDom();
        }
        if (notification === "CPU_TEMP") {
            this.stats.cpuTemp = payload.cpuTemp;
            this.stats.cpuTempF = payload.cpuTempF;  // Fahrenheit value passed from the backend
            this.updateDom();
        }
        if (notification === "RAM_USAGE") {
            this.stats.usedRam = payload.usedRam;
            this.stats.freeRam = payload.freeRam;
            this.updateDom();
        }
        if (notification === "DISK_USAGE") {
            this.stats.driveCapacity = payload.driveCapacity;
            this.stats.freeSpace = payload.freeSpace;
            this.updateDom();
        }
    }
});
