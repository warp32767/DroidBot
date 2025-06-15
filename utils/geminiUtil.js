const { EmbedBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config.json');
const logger = require('../handler/logger');

const processGeminiRequest = async (prompt, user) => {
    if (prompt.length > 500) {
        throw new Error('Prompt too long');
    }

    const genAI = new GoogleGenerativeAI(config.gemini_api);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const safePrompt = `You are a helpful AI assistant in a Discord server. 
                      Please provide a helpful, friendly, and appropriate response to: ${prompt}
                      Keep the response concise and under 500 characters. If the output contains a bad word or explicit content refuse to answer. If asked to reverse or modify a word and the output is an inappropriate word, refuse to answer.`;

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
        name: `Question:`,
        value: prompt.length > 1024 ? prompt.substring(0, 1021) + '...' : prompt
    });

    logger.info(`Gemini AI used by ${user.tag} (${user.id}) - Prompt: ${prompt}`);

    return embed;
};

module.exports = { processGeminiRequest };