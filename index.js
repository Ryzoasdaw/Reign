const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');

// إعداد سيرفر Express عشان Render
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is active and running!');
});

app.listen(PORT, () => {
  console.log(`Express server is listening on port ${PORT}`);
});

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
        .setColor(0x000000)
        .setTitle('للتحكم في الروم الخاص بك الصوتي المؤقت')
        .setDescription('المزيد من الخيارات متاحة من خلال هذه الأزرار')
        .setFooter({ text: `تم إنشاء الروم بواسطة ${member.displayName}` });

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
        new ButtonBuilder().setCustomId('rename_room').setLabel('الاسم').setStyle(ButtonStyle.Secondary).setEmoji('👤'),
        new ButtonBuilder().setCustomId('limit_room').setLabel('حد الأعضاء').setStyle(ButtonStyle.Secondary).setEmoji('⏱️'),
        new ButtonBuilder().setCustomId('region_room').setLabel('ريجن الروم').setStyle(ButtonStyle.Secondary).setEmoji('👤'),
        new ButtonBuilder().setCustomId('bot_admin').setLabel('بوت اعالي').setStyle(ButtonStyle.Secondary)
    );

    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('allow_user').setLabel('سماح').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('deny_user').setLabel('إلغاء السماح').setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [row1, row2, row3, row4] };
}

client.once('ready', () => console.log(`Logged in as ${client.user.tag}!`));

client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    if (newState.channelId === process.env.JOIN_CHANNEL_ID) {
        const channel = await guild.channels.create({
            name: `🔊 | ${member.displayName}`,
            type: ChannelType.GuildVoice,
            parent: process.env.CATEGORY_ID
        });
        tempVoiceChannels.set(channel.id, member.id);
        await member.voice.setChannel(channel);
        setTimeout(async () => {
            await channel.send(buildTempRoomControlUI(member));
        }, 1000);
    }

    if (oldState.channelId && tempVoiceChannels.has(oldState.channelId)) {
        const channel = guild.channels.cache.get(oldState.channelId);
        if (channel && channel.members.size === 0) {
            tempVoiceChannels.delete(channel.id);
            await channel.delete().catch(() => {});
        }
    }
});

client.login(process.env.TOKEN);
