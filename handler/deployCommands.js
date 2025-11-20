const { REST, Routes } = require('discord.js');
const { clientId, token } = require('../config.json');
const logger = require("./logger");
const { getCommands } = require('../utils/getCommands');
const path = require('node:path');

async function deployCommands(client, guilds) {
    const commands = [];
    const commandsPath = path.join(__dirname, '../commands');
    const commandObjects = getCommands(commandsPath);

    for (const command of commandObjects) {
        commands.push(command.data.toJSON());
    }

    const rest = new REST().setToken(token);

    try {
        logger.info(`Started refreshing ${commands.length} application (/) commands.`);

        // Parallel deployment to all guilds
        const deployPromises = guilds.map(async (guildId) => {
            try {
                const data = await rest.put(
                    Routes.applicationGuildCommands(clientId, guildId),
                    { body: commands },
                );
                logger.info(`Successfully reloaded ${data.length} application (/) commands for guild ${guildId}.`);
            } catch (error) {
                logger.error(`Failed to reload commands for guild ${guildId}: ${error.message}`);
            }
        });

        await Promise.all(deployPromises);
        logger.info('Finished deploying commands to all guilds.');

    } catch (error) {
        logger.error(`Failed to reload commands: ${error.message}`);
    }
}

module.exports = {
    deployCommands,
};
