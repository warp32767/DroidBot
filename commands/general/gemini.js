const { SlashCommandBuilder } = require(`@discordjs/builders`);
const { EmbedBuilder, Collection, PermissionFlagsBits } = require(`discord.js`);
const { processGeminiRequest } = require('../../utils/geminiUtil');
const logger = require(`../../handler/logger`);

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

            cooldowns.set(userId, now + cooldownDuration);
            setTimeout(() => cooldowns.delete(userId), cooldownDuration);
        }

        await interaction.deferReply();

        try {
            const prompt = interaction.options.getString(`prompt`);
            const embed = await processGeminiRequest(prompt, interaction.user);
            await interaction.followUp({ embeds: [embed] });

        } catch (error) {
            if (error.message === 'Prompt too long') {
                await interaction.followUp({
                    content: `Your prompt is too long! Please keep it under 500 characters.`,
                    ephemeral: true
                });
                return;
            }

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