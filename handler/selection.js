const logger = require('./logger');

function onSelection(collector, handler) {
    collector.on('collect', async interaction => {
        try {
            await interaction.deferUpdate();
            collector.stop('selected');
            await handler(interaction);
        } catch (error) {
            logger.error(`Selection failed: ${error.stack || error.message}`);
            try {
                const payload = { content: 'Unable to fetch the selected item. Please try again later.', components: [] };
                if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
                else await interaction.reply({ content: payload.content, ephemeral: true });
            } catch (replyError) {
                logger.error(`Selection error reply failed: ${replyError.message}`);
            }
        }
    });
}

module.exports = { onSelection };
