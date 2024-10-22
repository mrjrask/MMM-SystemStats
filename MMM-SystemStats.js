Module.register("MMM-SystemStats", {
    defaults: {
        updateInterval: 5000, // update every 5 seconds
    },

    start: function() {
        this.stats = {
            cpuUsage: [],
            cpuTemp: 0,
            totalRam: 0,
            freeRam: 0
        };
        this.updateStats();
        this.scheduleUpdate();
    },

    updateStats: function() {
        this.sendSocketNotification("GET_SYSTEM_STATS");
    },

    scheduleUpdate: function() {
        setInterval(() => {
            this.updateStats();
        }, this.config.updateInterval);
    },

    getDom: function() {
        let wrapper = document.createElement("div");
        wrapper.className = "system-stats";

        // CPU Usage Bars
        let cpuUsageWrapper = document.createElement("div");
        cpuUsageWrapper.className = "cpu-usage";
        let titleCpu = document.createElement("h2");
        titleCpu.innerHTML = "CPU Usage:";
        cpuUsageWrapper.appendChild(titleCpu);

        this.stats.cpuUsage.forEach((usage, core) => {
            let coreUsage = document.createElement("div");
            coreUsage.innerHTML = `Core ${core + 1}: <progress value="${usage}" max="100"></progress>`;
            cpuUsageWrapper.appendChild(coreUsage);
        });

        // CPU Temperature
        let cpuTempWrapper = document.createElement("div");
        cpuTempWrapper.className = "cpu-temp";
        let titleTemp = document.createElement("h2");
        titleTemp.innerHTML = `CPU Temperature: ${this.stats.cpuTemp}°C`;
        cpuTempWrapper.appendChild(titleTemp);

        // RAM Usage Bar
        let ramUsageWrapper = document.createElement("div");
        ramUsageWrapper.className = "ram-usage";
        let titleRam = document.createElement("h2");
        titleRam.innerHTML = `RAM Usage: ${this.stats.totalRam - this.stats.freeRam}MB/${this.stats.totalRam}MB`;
        let ramBar = document.createElement("progress");
        ramBar.value = (this.stats.totalRam - this.stats.freeRam);
        ramBar.max = this.stats.totalRam;
        ramUsageWrapper.appendChild(titleRam);
        ramUsageWrapper.appendChild(ramBar);

        wrapper.appendChild(cpuUsageWrapper);
        wrapper.appendChild(cpuTempWrapper);
        wrapper.appendChild(ramUsageWrapper);

        return wrapper;
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "SYSTEM_STATS") {
            this.stats = payload;
            this.updateDom();
        }
    }
});
