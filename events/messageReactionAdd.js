const { Events, EmbedBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config.json');
const logger = require('../handler/logger');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        // Fetch partial reactions and messages if needed
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (error) {
                logger.error('Something went wrong when fetching the reaction:', error);
                return;
            }
        }
        if (reaction.message.partial) {
            try {
                await reaction.message.fetch();
            } catch (error) {
                logger.error('Something went wrong when fetching the message:', error);
                return;
            }
        }

        // Check if reaction is robot emoji and user has admin permissions
        if (reaction.emoji.name === '🤖') {
            // Get the guild member who reacted
            const member = await reaction.message.guild.members.fetch(user.id);

            // Check if user has administrator permission
            if (!member.permissions.has('Administrator')) {
                return;
            }

            try {
                // Get the message content as prompt
                const prompt = reaction.message.content;

                if (!prompt || prompt.length === 0) {
                    return; // Skip if message is empty or contains no text
                }

                if (prompt.length > 500) {
                    await reaction.message.reply({
                        content: `Message is too long! Please keep it under 500 characters.`,
                        ephemeral: true
                    });
                    return;
                }

                const genAI = new GoogleGenerativeAI(config.gemini_api);
                const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

                const safePrompt = `You are a helpful AI assistant in a Discord server. 
                                  Please provide a helpful, friendly, and appropriate response to: ${prompt}
                                  Keep the response concise and under 500 characters. If the output contains a bad word or explicit content refuse to answer.`;

                const result = await model.generateContent(safePrompt);
                const response = result.response.text();

                const embed = new EmbedBuilder()
                    .setTitle(`🤖 Gemini Response`)
                    .setDescription(response)
                    .setColor(0x00A8FF)
                    .setFooter({
                        text: `Requested by ${user.tag}`,
                        iconURL: user.displayAvatarURL()
                    })
                    .setTimestamp();

                embed.addFields({
                    name: `Original Message:`,
                    value: prompt.length > 1024 ? prompt.substring(0, 1021) + '...' : prompt
                });

                await reaction.message.reply({ embeds: [embed] });
                logger.info(`Gemini response requested by ${user.tag} (${user.id}) - Prompt: ${prompt}`);

            } catch (error) {
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