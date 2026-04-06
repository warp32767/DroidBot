const { Events, EmbedBuilder } = require('discord.js');
const { checkMessage } = require('./helper/filterTool');
const config = require('../config.json');
const logger = require("../handler/logger")
const MOD_LOG_CHANNEL_ID = config.log_channel;

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || message.system) return;

        const result = checkMessage(message.content);
        if (!result.blocked) return;

        try {
            await message.delete();
        } catch (err) {
            logger.error(`[automod] Failed to delete message ${message.id}:`, err);
        }

        if (MOD_LOG_CHANNEL_ID) {
            const logChannel = message.guild?.channels.cache.get(MOD_LOG_CHANNEL_ID);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setColor(0xe74c3c)
                    .setTitle('AutoMod — Message Removed')
                    .addFields(
                        { name: 'User', value: `${message.author} (${message.author.tag})`, inline: true },
                        { name: 'Channel', value: `${message.channel}`, inline: true },
                        { name: 'Matched', value: `\`${result.match}\``, inline: true },
                        { name: 'Flagged Message', value: `\`\`\`${message.content.slice(0, 1000)}\`\`\`` },
                    )
                    .setTimestamp()
                    .setFooter({ text: `User ID: ${message.author.id}` });

                await logChannel.send({ embeds: [embed] });
            }
        }

        logger.info(`[automod] Removed message from ${message.author.tag} — matched: "${result.match}"`);
    },
};