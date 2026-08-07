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

function getControlUI(member) {
    const embed = new EmbedBuilder()
        .setColor(0x3b82f6)
        .setTitle('لوحة تحكم الروم الصوتي المؤقت')
        .setDescription('استخدم الأزرار أدناه للتحكم في قناتك الصوتية:')
        .setFooter({ text: `أنشأ بواسطة ${member.displayName}`, iconURL: member.user.displayAvatarURL() });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('lock_room').setLabel('قفل').setStyle(ButtonStyle.Secondary).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('unlock_room').setLabel('افتح').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('unhide_room').setLabel('إظهار').setStyle(ButtonStyle.Secondary).setEmoji('👁️'),
        new ButtonBuilder().setCustomId('hide_room').setLabel('إخفاء').setStyle(ButtonStyle.Secondary).setEmoji('🔒')
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('kick_user').setLabel('طرد').setStyle(ButtonStyle.Secondary).setEmoji('👢'),
        new ButtonBuilder().setCustomId('ban_user').setLabel('حظر').setStyle(ButtonStyle.Secondary).setEmoji('👤'),
        new ButtonBuilder().setCustomId('unban_user').setLabel('إلغاء الحظر').setStyle(ButtonStyle.Secondary).setEmoji('👤'),
        new ButtonBuilder().setCustomId('invite_user').setLabel('دعوة').setStyle(ButtonStyle.Secondary).setEmoji('✉️')
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rename_room').setLabel('تغيير الاسم').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId('limit_room').setLabel('الحد الأقصى').setStyle(ButtonStyle.Secondary).setEmoji('⏱️'),
        new ButtonBuilder().setCustomId('region_room').setLabel('الريجن').setStyle(ButtonStyle.Secondary).setEmoji('🌍'),
        new ButtonBuilder().setCustomId('bot_admin').setLabel('صلاحيات').setStyle(ButtonStyle.Secondary).setEmoji('⚙️')
    );

    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('allow_user').setLabel('سماح').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('deny_user').setLabel('إلغاء السماح').setStyle(ButtonStyle.Danger)
    );

    return {
        content: `<@${member.id}>`,
        embeds: [embed],
        components: [row1, row2, row3, row4]
    };
}

client.once('ready', () => {
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
                    { 
                        id: member.id, 
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.Connect, 
                            PermissionFlagsBits.ManageChannels, 
                            PermissionFlagsBits.SendMessages, 
                            PermissionFlagsBits.ReadMessageHistory
                        ] 
                    },
                    { 
                        id: client.user.id, 
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.Connect, 
                            PermissionFlagsBits.ManageChannels, 
                            PermissionFlagsBits.SendMessages, 
                            PermissionFlagsBits.ReadMessageHistory
                        ] 
                    }
                ]
            });

            tempVoiceChannels.set(voiceChannel.id, member.id);
            await member.voice.setChannel(voiceChannel);

            setTimeout(async () => {
                try {
                    await voiceChannel.send(getControlUI(member));
                } catch (err) {
                    console.error("خطأ في إرسال اللوحة داخل شات الصوت:", err);
                }
            }, 1500);

        } catch (err) {
            console.error("خطأ أثناء إنشاء الروم الصوتي:", err);
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
