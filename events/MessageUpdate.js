const { Events, EmbedBuilder } = require('discord.js');
const { checkMessage } = require('./helper/filterTool');
const config = require('../config.json');
const logger = require("../handler/logger")
const MOD_LOG_CHANNEL_ID = config.log_channel;

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        if (newMessage.author?.bot || newMessage.system) return;

        const beforeEdit = oldMessage.content ?? '';
        const flaggedMessage = newMessage.content ?? '';
        if (!flaggedMessage) return;

        const result = checkMessage(flaggedMessage);
        if (!result.blocked) return;

        try {
            await newMessage.delete();
        } catch (err) {
            logger.error(`[automod] Failed to delete edited message ${newMessage.id}:`, err);
        }

        if (MOD_LOG_CHANNEL_ID) {
            const logChannel = newMessage.guild?.channels.cache.get(MOD_LOG_CHANNEL_ID);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setColor(0xe74c3c)
                    .setTitle('AutoMod — Edited Message Removed')
                    .addFields(
                        { name: 'User', value: `${newMessage.author} (${newMessage.author.tag})`, inline: true },
                        { name: 'Channel', value: `${newMessage.channel}`, inline: true },
                        { name: 'Matched', value: `\`${result.match}\``, inline: true },
                        { name: 'Before Edit', value: `\`\`\`${beforeEdit.slice(0, 1000) || 'Unavailable'}\`\`\`` },
                        { name: 'Flagged Message', value: `\`\`\`${flaggedMessage.slice(0, 1000)}\`\`\`` },
                    )
                    .setTimestamp()
                    .setFooter({ text: `User ID: ${newMessage.author.id}` });

                await logChannel.send({ embeds: [embed] });
            }
        }

        logger.info(`[automod] Removed edited message from ${newMessage.author.tag} — matched: "${result.match}"`);
    },
};