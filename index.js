const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is active!'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const tempVoiceChannels = new Map();

client.on('ready', () => {
    console.log(`Bot logged in as ${client.user.tag}`);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild;
    const member = newState.member;
    if (!member || member.user.bot) return;

    if (newState.channelId === process.env.JOIN_CHANNEL_ID) {
        try {
            const voiceChannel = await guild.channels.create({
                name: `🔊 | ${member.displayName}`,
                type: ChannelType.GuildVoice,
                parent: process.env.CATEGORY_ID,
                permissionOverwrites: [
                    { id: guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
                    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.SendMessages] },
                    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.SendMessages] }
                ]
            });

            tempVoiceChannels.set(voiceChannel.id, member.id);
            await member.voice.setChannel(voiceChannel);

            const embed = new EmbedBuilder()
                .setColor(0x3b82f6)
                .setTitle('لوحة التحكم')
                .setDescription('تحكم برومك الصوتي من هنا');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('lock_room').setLabel('قفل').setStyle(ButtonStyle.Secondary).setEmoji('🔒'),
                new ButtonBuilder().setCustomId('unlock_room').setLabel('افتح').setStyle(ButtonStyle.Secondary).setEmoji('🔓')
            );

            setTimeout(async () => {
                try {
                    await voiceChannel.send({ embeds: [embed], components: [row] });
                } catch (e) {
                    console.log("ديسكورد يرفض إرسال رسالة في شات الصوت المؤقت:", e.message);
                }
            }, 2000);

        } catch (err) {
            console.error(err);
        }
    }

    if (oldState.channelId && tempVoiceChannels.has(oldState.channelId)) {
        const voiceChannel = oldState.guild.channels.cache.get(oldState.channelId);
        if (voiceChannel && voiceChannel.members.size === 0) {
            tempVoiceChannels.delete(oldState.channelId);
            await voiceChannel.delete().catch(() => {});
        }
    }
});

client.login(process.env.TOKEN);
