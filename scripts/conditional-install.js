// scripts/conditional-install.js
const { execSync } = require("child_process");
const os = require("os");
const readline = require("readline");

const isPi =
    os.platform() === "linux" && (os.arch() === "arm" || os.arch() === "arm64");

if (!isPi) {
    console.log("Not running on Raspberry Pi. Skipping DHT22 install.");
    process.exit(0);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question(
    "Raspberry Pi detected. Do you want to install the DHT22 sensor library (node-dht-sensor)? (y/N) ",
    (answer) => {
        rl.close();
        if (answer.trim().toLowerCase() === "y") {
            console.log("Installing node-dht-sensor...");
            try {
                execSync("npm install node-dht-sensor", { stdio: "inherit" });
                console.log("node-dht-sensor installed successfully.");
            } catch (err) {
                console.error("Failed to install node-dht-sensor:", err);
            }
        } else {
            console.log("Skipped installing node-dht-sensor.");
        }
    }
);
