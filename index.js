const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');

// سيرفر للـ Port
const app = express();
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// مصفوفة لتخزين الرومات المؤقتة
const tempChannels = new Set();

function buildUI(member) {
    const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle('للتحكم في الروم الخاص بك الصوتي المؤقت')
        .setDescription('المزيد من الخيارات متاحة من خلال هذه الأزرار')
        .setFooter({ text: `تم إنشاء الروم بواسطة ${member.displayName}` });

    const rows = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('lock_room').setLabel('قفل').setStyle(ButtonStyle.Secondary).setEmoji('🔒'),
            new ButtonBuilder().setCustomId('unlock_room').setLabel('افتح').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
            new ButtonBuilder().setCustomId('unhide_room').setLabel('اظهار').setStyle(ButtonStyle.Secondary).setEmoji('👁️'),
            new ButtonBuilder().setCustomId('hide_room').setLabel('احفاء').setStyle(ButtonStyle.Secondary).setEmoji('👁️‍🗨️')
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('kick_user').setLabel('طرد').setStyle(ButtonStyle.Secondary).setEmoji('👢'),
            new ButtonBuilder().setCustomId('ban_user').setLabel('حظر').setStyle(ButtonStyle.Secondary).setEmoji('👤'),
            new ButtonBuilder().setCustomId('unban_user').setLabel('إلغاء الحظر').setStyle(ButtonStyle.Secondary).setEmoji('👤'),
            new ButtonBuilder().setCustomId('invite_user').setLabel('دعوة').setStyle(ButtonStyle.Secondary).setEmoji('✉️')
        )
    ];
    return { embeds: [embed], components: rows };
}

client.on('voiceStateUpdate', async (oldState, newState) => {
    const member = newState.member;
    if (!member || member.user.bot) return;

    // 1. إنشاء الروم
    if (newState.channelId === process.env.JOIN_CHANNEL_ID) {
        const channel = await newState.guild.channels.create({
            name: `🔊 | ${member.displayName}`,
            type: ChannelType.GuildVoice,
            parent: process.env.CATEGORY_ID,
            permissionOverwrites: [
                { id: newState.guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
                { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.SendMessages] }
            ]
        });

        tempChannels.add(channel.id);
        await member.voice.setChannel(channel);

        // إرسال الرسالة
        setTimeout(async () => {
            try {
                // نرسل الرسالة في الروم الصوتي نفسه
                await channel.send(buildUI(member));
            } catch (err) {
                console.log("فشل إرسال الرسالة داخل الروم");
            }
        }, 1000);
    }

    // 2. حذف الروم
    if (oldState.channelId && tempChannels.has(oldState.channelId)) {
        const channel = oldState.guild.channels.cache.get(oldState.channelId);
        if (channel && channel.members.size === 0) {
            tempChannels.delete(channel.id);
            await channel.delete().catch(() => {});
        }
    }
});

client.login(process.env.TOKEN);
