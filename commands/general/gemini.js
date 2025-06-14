const { SlashCommandBuilder } = require(`@discordjs/builders`);
const { EmbedBuilder, Collection, PermissionFlagsBits } = require(`discord.js`);
const { GoogleGenerativeAI } = require(`@google/generative-ai`);
const config = require('../../config.json');
const logger = require(`../../handler/logger`);

// Create cooldown collection
const cooldowns = new Collection();

module.exports = {
    data: new SlashCommandBuilder()
        .setName(`ask`)
        .setDescription(`Ask Gemini a question`)
        .addStringOption(option =>
            option
                .setName(`prompt`)
                .setDescription(`What would you like to ask?`)
                .setRequired(true)),

    async execute(interaction) {
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isAdmin) {
            const userId = interaction.user.id;
            const now = Date.now();
            const cooldownDuration = 10 * 1000;

            if (cooldowns.has(userId)) {
                const cooldownEnd = cooldowns.get(userId);
                const timeLeft = (cooldownEnd - now) / 1000;

                if (now < cooldownEnd) {
                    return interaction.reply({ 
                        content: `Please wait ${timeLeft.toFixed(1)} seconds before using this command again.`,
                        ephemeral: true 
                    });
                }
            }

            // Set cooldown
            cooldowns.set(userId, now + cooldownDuration);
            setTimeout(() => cooldowns.delete(userId), cooldownDuration);
        }

        await interaction.deferReply();

        try {
            const prompt = interaction.options.getString(`prompt`);
            
            if (prompt.length > 500) {
                await interaction.followUp({
                    content: `Your prompt is too long! Please keep it under 500 characters.`,
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
                    text: `Asked by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setTimestamp();

            embed.addFields({ 
                name: `Question:`, 
                value: prompt.length > 1024 ? prompt.substring(0, 1021) + '...' : prompt
            });

            await interaction.followUp({
                embeds: [embed]
            });

            logger.info(`Gemini AI used by ${interaction.user.tag} (${interaction.user.id}) - Prompt: ${prompt}`);

        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setTitle(`❌ Error`)
                .setDescription(`Sorry, I encountered an error while processing your request. Please try again later.`)
                .setColor(0xFF0000);

            await interaction.followUp({ 
                embeds: [errorEmbed], 
                ephemeral: true 
            });

            logger.error(`Gemini AI error: ${error}`);
        }
    }
};