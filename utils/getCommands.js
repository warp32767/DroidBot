const fs = require('node:fs');
const path = require('node:path');
const logger = require("../handler/logger");

function getCommands(commandsPath) {
    const commands = [];
    const commandFolders = fs.readdirSync(commandsPath);

    for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        // Ensure it's a directory
        if (fs.statSync(folderPath).isDirectory()) {
            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                const filePath = path.join(folderPath, file);
                try {
                    // Clear cache to ensure fresh load
                    delete require.cache[require.resolve(filePath)];
                    const command = require(filePath);

                    if ('data' in command && 'execute' in command) {
                        commands.push(command);
                    } else {
                        logger.warning(`The command at ${filePath} is missing a required "data" or "execute" property.`);
                    }
                } catch (error) {
                    logger.error(`Error loading command ${filePath}: ${error.message}`);
                }
            }
        }
    }
    return commands;
}

module.exports = { getCommands };
