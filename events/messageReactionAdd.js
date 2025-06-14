const { Events, EmbedBuilder } = require('discord.js');
const { processGeminiRequest } = require('../utils/geminiUtil');
const logger = require('../handler/logger');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        // Directly access the reaction and message without handling partials

        if (reaction.emoji.name === '🤖') {
            const member = await reaction.message.guild.members.fetch(user.id);

            if (!member.permissions.has('Administrator')) {
                return; // Stop if the user isn't an admin
            }

            try {
                const prompt = reaction.message.content;

                if (!prompt || prompt.length === 0) {
                    return; // Stop if the message has no content
                }

                const embed = await processGeminiRequest(prompt, user);
                await reaction.message.reply({ embeds: [embed] });

            } catch (error) {
                if (error.message === 'Prompt too long') {
                    await reaction.message.reply({
                        content: `Message is too long! Please keep it under 500 characters.`,
                    });
                    return;
                }

                const errorEmbed = new EmbedBuilder()
                    .setTitle(`❌ Error`)
                    .setDescription(`Sorry, I encountered an error while processing your request. Please try again later.`)
                    .setColor(0xFF0000);

                await reaction.message.reply({ embeds: [errorEmbed] });
                logger.error(`Gemini AI reaction error: ${error}`);
            }
        }
    },
};