const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');

// إعداد سيرفر Express عشان Render
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

function buildTempRoomControlUI(member) {
    const embed = new EmbedBuilder()
        .setColor(0x3b82f6)
        .setTitle('للتحكم في الروم الخاص بك الصوتي المؤقت')
        .setDescription('المزيد من الخيارات متاحة من خلال هذه الأزرار')
        .setFooter({ text: `تم إنشاء الروم بواسطة ${member.displayName}`, iconURL: member.user.displayAvatarURL() });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('lock_room').setLabel('قفل').setStyle(ButtonStyle.Secondary).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('unlock_room').setLabel('افتح').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('unhide_room').setLabel('اظهار').setStyle(ButtonStyle.Secondary).setEmoji('👁️'),
        new ButtonBuilder().setCustomId('hide_room').setLabel('احفاء').setStyle(ButtonStyle.Secondary).setEmoji('👁️‍🗨️')
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('kick_user').setLabel('طرد').setStyle(ButtonStyle.Secondary).setEmoji('👢'),
        new ButtonBuilder().setCustomId('ban_user').setLabel('حظر').setStyle(ButtonStyle.Secondary).setEmoji('👤'),
        new ButtonBuilder().setCustomId('unban_user').setLabel('إلغاء الحظر').setStyle(ButtonStyle.Secondary).setEmoji('👤'),
        new ButtonBuilder().setCustomId('invite_user').setLabel('دعوة').setStyle(ButtonStyle.Secondary).setEmoji('✉️')
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rename_room').setLabel('الاسم').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId('limit_room').setLabel('حد الأعضاء').setStyle(ButtonStyle.Secondary).setEmoji('⏱️'),
        new ButtonBuilder().setCustomId('region_room').setLabel('ريجن الروم').setStyle(ButtonStyle.Secondary).setEmoji('🌍'),
        new ButtonBuilder().setCustomId('bot_admin').setLabel('بوت اعالي').setStyle(ButtonStyle.Secondary)
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

client.once('ready', () => console.log(`Logged in as ${client.user.tag}!`));

client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild;
    const member = newState.member;
    if (!member || member.user.bot) return;

    // 1. عند دخول روم الإنشاء
    if (newState.channelId === process.env.JOIN_CHANNEL_ID) {
        try {
            // إنشاء روم صوتي مع صلاحيات كاملة للبوت والعضو
            const voiceChannel = await guild.channels.create({
                name: `🔊 | ${member.displayName}`,
                type: ChannelType.GuildVoice,
                parent: process.env.CATEGORY_ID,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
                    },
                    {
                        id: member.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.SendMessages]
                    },
                    {
                        id: client.user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.SendMessages]
                    }
                ]
            });

            tempVoiceChannels.set(voiceChannel.id, member.id);
            await member.voice.setChannel(voiceChannel);

            // إرسال اللوحة والأزرار داخل الشات الخاص بالقناة
            setTimeout(async () => {
                try {
                    await voiceChannel.send(buildTempRoomControlUI(member));
                } catch (err) {
                    console.error("خطأ في إرسال اللوحة:", err);
                }
            }, 1500);

        } catch (error) {
            console.error("خطأ أثناء إنشاء الروم:", error);
        }
    }

    // 2. حذف الروم إذا أصبح فارغاً
    if (oldState.channelId && tempVoiceChannels.has(oldState.channelId)) {
        const voiceChannel = oldState.guild.channels.cache.get(oldState.channelId);
        if (voiceChannel && voiceChannel.members.size === 0) {
            tempVoiceChannels.delete(voiceChannel.id);
            await voiceChannel.delete().catch(() => {});
        }
    }
});

client.login(process.env.TOKEN);
