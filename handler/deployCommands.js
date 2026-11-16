const { REST, Routes } = require('discord.js');
const { clientId, token } = require('../config.json');
const logger = require('./logger');

async function deployCommands(client, guilds) {
    // Deploy exactly the modules that the running client will execute.
    const commands = [...client.commands.values()].map(command => command.data.toJSON());
    const rest = new REST().setToken(token);
    logger.info(`Started refreshing ${commands.length} application commands.`);
    for (const guildId of guilds) {
        try {
            const data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
            logger.info(`Reloaded ${data.length} application commands for guild ${guildId}.`);
        } catch (error) {
            logger.error(`Failed to reload commands for guild ${guildId}: ${error.message}`);
        }
    }
}

module.exports = { deployCommands };
