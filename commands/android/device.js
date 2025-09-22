const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

function searchDevices(cdn, data) {
    if (!cdn) {
        return [];
    }

    const results = [];

    // The user input can be a full device name or a codename, so we should search in both 'name' and 'device' properties.
    const normalizedCdn = cdn.toLowerCase();

    for (const brand in data) {
        if (Object.prototype.hasOwnProperty.call(data, brand)) {
            const devices = data[brand];
            for (const device of devices) {
                // We're now checking both the codename and the device name
                if (device.device.toLowerCase().includes(normalizedCdn) || device.name.toLowerCase().includes(normalizedCdn)) {
                    results.push({ brand, name: device.name, device: device.device });
                }
            }
        }
    }

    // Sort the results to show exact matches first
    results.sort((a, b) => {
        const aMatchesExact = a.device.toLowerCase() === normalizedCdn;
        const bMatchesExact = b.device.toLowerCase() === normalizedCdn;

        if (aMatchesExact && !bMatchesExact) return -1;
        if (!aMatchesExact && bMatchesExact) return 1;
        return 0;
    });

    return results;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('device')
        .setDescription('Get a device\'s name from its codename')
        .addStringOption(option =>
            option.setName('codename')
                .setDescription('The codename to lookup')
                .setRequired(true)
        ),
    async execute(interaction) {
        const cdnInput = interaction.options.getString('codename');
        // A more robust regex to remove any character that isn't a letter or a number.
        const cleanedCdn = cdnInput.replace(/[^a-zA-Z0-9]/g, '');
        const url = 'https://raw.githubusercontent.com/androidtrackers/certified-android-devices/master/by_brand.json';

        try {
            const json = await axios.get(url);
            const jsonData = json.data;

            const devices = searchDevices(cleanedCdn, jsonData);
            if (devices.length === 0) {
                await interaction.reply({ content: "Codename not found!" });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle(`Devices matching \`${cleanedCdn}\``)
                .setColor('#2eb237');

            const uniqueDevices = new Map();
            let counter = 0;

            for (const result of devices) {
                // Use a combination of brand and name
                const key = `${result.brand}_${result.name}`;
                if (counter < 25 && !uniqueDevices.has(key)) {
                    uniqueDevices.set(key, true);
                    let fieldName = result.name;
                    // Haven't tested this shit yet
                    if (result.name.toLowerCase().startsWith(result.brand.toLowerCase())) {
                        fieldName = result.name;
                    } else {
                        fieldName = `${result.brand} ${result.name}`;
                    }

                    embed.addFields({
                        name: fieldName,
                        value: `\`${result.device}\``,
                        inline: true
                    });
                    counter++;
                }
            }
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching device:', error);
            await interaction.reply({ content: 'An error occurred while fetching the devices. Please try again later.', ephemeral: true });
        }
    },
};