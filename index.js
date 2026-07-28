const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
    EmbedBuilder,
    AttachmentBuilder
} = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
require('dotenv').config();

const OWNER_ID = '771475413838594110';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const tempChannels = new Map();
const userVoiceActivity = new Map(); 
let leaderboardMessageId = null;

client.once('ready', async () => {
    console.log(`🤖 البوت متصل باسم: ${client.user.tag}`);

    for (const guild of client.guilds.cache.values()) {
        for (const channel of guild.channels.cache.values()) {
            if (channel.isVoiceBased()) {
                for (const [memberId, member] of channel.members) {
                    if (!member.user.bot) {
                        userVoiceActivity.set(memberId, {
                            voiceTime: userVoiceActivity.get(memberId)?.voiceTime || 0,
                            joinTimestamp: Date.now()
                        });
                    }
                }
            }
        }
    }

    updateHourlyLeaderboard();
    setInterval(() => {
        updateHourlyLeaderboard();
    }, 60 * 60 * 1000); 
});

// 🎨 بناء اللوحة المطابقة للصور المرفقة تماماً
async function buildControlPanelEmbed() {
    const embed = new EmbedBuilder()
        .setColor(0x57F287) // لون الخط الجانبي الأخضر المطابق للصورة
        .setTitle('Temp Voice Control Panel')
        .setDescription(
            'Use these controls while you are inside your temporary voice room.\n\n' +
            '--------------------------------------------------\n' +
            '**Room Controls**\n\n' +
            '--------------------------------------------------\n' +
            '**Member Controls**'
        );

    // الصف الأول - Room Controls
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_lock').setLabel('Lock').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_unlock').setLabel('Open').setEmoji('🔓').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_hide').setLabel('Hide').setEmoji('🙈').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_show').setLabel('Show').setEmoji('👁️').setStyle(ButtonStyle.Secondary)
    );

    // الصف الثاني - Room Controls
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_rename').setLabel('Rename Room').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_limit').setLabel('Change Limit').setEmoji('👥').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_region').setLabel('Change Region').setEmoji('🌐').setStyle(ButtonStyle.Secondary)
    );

    // الصف الثالث - Member Controls
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_kick').setLabel('Kick Member').setEmoji('❌').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_block').setLabel('Block Member').setEmoji('🚫').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_unblock').setLabel('Unblock Member').setEmoji('🔓').setStyle(ButtonStyle.Secondary)
    );

    // الصف الرابع - Member Controls
    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_invite').setLabel('Invite Member').setEmoji('✉️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_trust').setLabel('Trust Member').setEmoji('👤').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_untrust').setLabel('Untrust Member').setEmoji('👤').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('btn_allow_role').setLabel('Allow Role').setEmoji('👤').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2, row3, row4] };
}

// ✨ دالة تنسيق الوقت
function formatTime(ms) {
    if (!ms || ms < 1000) return '0s';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    const parts = [];
    if (days > 0 || hours > 0) {
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
    } else {
        if (minutes > 0) parts.push(`${minutes}m`);
        if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    }
    return parts.join(' ');
}

function getUserTotalTime(userId) {
    const data = userVoiceActivity.get(userId);
    if (!data) return 0;
    let currentSession = 0;
    if (data.joinTimestamp) {
        currentSession = Date.now() - data.joinTimestamp;
    }
    return data.voiceTime + currentSession;
}

// Canvas الرسم
async function generateLeaderboardCanvas(topUsers, guild) {
    const width = 1000;
    const height = 550;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d0f1b';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(guild.name || 'Server Leaderboard', 30, 45);
    ctx.fillStyle = '#7a7f9d';
    ctx.font = '14px sans-serif';
    ctx.fillText('Voice activity / weekly competition / live standings', 30, 68);

    ctx.fillStyle = '#141829';
    ctx.beginPath();
    ctx.roundRect(30, 95, 290, 420, 15);
    ctx.fill();

    const top1 = topUsers[0];
    if (top1) {
        ctx.fillStyle = '#ff3b30';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('#1', 50, 130);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(top1.member ? top1.member.displayName : 'Unknown', 80, 130);

        try {
            const avatarUrl = top1.member ? top1.member.user.displayAvatarURL({ extension: 'png', size: 128 }) : '';
            if (avatarUrl) {
                const avatar = await loadImage(avatarUrl);
                ctx.save();
                ctx.beginPath();
                ctx.arc(175, 210, 50, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(avatar, 125, 160, 100, 100);
                ctx.restore();
            }
        } catch (e) {}

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText(formatTime(top1.time), 50, 310);

        ctx.fillStyle = '#22273e';
        ctx.beginPath();
        ctx.roundRect(50, 360, 250, 8, 4);
        ctx.fill();

        ctx.fillStyle = '#e5a93b';
        ctx.beginPath();
        ctx.roundRect(50, 360, 250, 8, 4);
        ctx.fill();
    }

    const startX = 340;
    let currentY = 95;
    const cardWidth = 300;
    const cardHeight = 75;

    for (let i = 1; i < 10; i++) {
        const user = topUsers[i];
        const isRightColumn = i >= 6;
        const colX = isRightColumn ? startX + cardWidth + 20 : startX;
        const rowY = isRightColumn ? currentY + ((i - 6) * 85) : currentY + ((i - 1) * 85);

        ctx.fillStyle = '#141829';
        ctx.beginPath();
        ctx.roundRect(colX, rowY, cardWidth, cardHeight, 10);
        ctx.fill();

        ctx.fillStyle = '#5865f2';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`#${i + 1}`, colX + 12, rowY + 43);

        if (user) {
            try {
                const avatarUrl = user.member ? user.member.user.displayAvatarURL({ extension: 'png', size: 64 }) : '';
                if (avatarUrl) {
                    const avatar = await loadImage(avatarUrl);
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(colX + 60, rowY + 37, 18, 0, Math.PI * 2);
                    ctx.closePath();
                    ctx.clip();
                    ctx.drawImage(avatar, colX + 42, rowY + 19, 36, 36);
                    ctx.restore();
                }
            } catch (e) {}

            ctx.fillStyle = '#ffffff';
            ctx.font = '13px sans-serif';
            const name = user.member ? user.member.displayName : 'Unknown';
            ctx.fillText(name.substring(0, 10), colX + 85, rowY + 33);

            ctx.fillStyle = '#00f2fe';
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(formatTime(user.time), colX + cardWidth - 85, rowY + 33);

            ctx.fillStyle = '#22273e';
            ctx.beginPath();
            ctx.roundRect(colX + 85, rowY + 45, 190, 4, 2);
            ctx.fill();

            ctx.fillStyle = '#00f2fe';
            ctx.beginPath();
            ctx.roundRect(colX + 85, rowY + 45, 100, 4, 2);
            ctx.fill();
        } else {
            ctx.fillStyle = '#4a4d68';
            ctx.font = '12px sans-serif';
            ctx.fillText('لا يوجد لاعب', colX + 85, rowY + 40);
        }
    }

    return canvas.toBuffer('image/png');
}

async function updateHourlyLeaderboard() {
    const leaderboardChannelId = process.env.LEADERBOARD_CHANNEL_ID;
    if (!leaderboardChannelId) return;

    const channel = client.channels.cache.get(leaderboardChannelId);
    if (!channel) return;

    const topData = [];

    for (const [userId] of userVoiceActivity.entries()) {
        const totalTime = getUserTotalTime(userId);
        if (totalTime > 0) {
            const member = await channel.guild.members.fetch(userId).catch(() => null);
            topData.push({ userId, time: totalTime, member });
        }
    }

    topData.sort((a, b) => b.time - a.time);

    const imageBuffer = await generateLeaderboardCanvas(topData, channel.guild);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_my_points').setLabel('نقاطي').setStyle(ButtonStyle.Secondary).setEmoji('👆'),
        new ButtonBuilder().setCustomId('btn_reset_points').setLabel('تصفير').setStyle(ButtonStyle.Danger).setEmoji('🔄')
    );

    const messageContent = {
        content: '⏳ **سيتم التحديث خلال ساعة**',
        files: [attachment],
        components: [row]
    };

    try {
        if (leaderboardMessageId) {
            const msg = await channel.messages.fetch(leaderboardMessageId).catch(() => null);
            if (msg) {
                await msg.edit(messageContent);
                return;
            }
        }
        const newMsg = await channel.send(messageContent);
        leaderboardMessageId = newMsg.id;
    } catch (error) {
        console.error('Error updating leaderboard:', error);
    }
}

// الأوامر النصية
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // امر إنشاء اللوحة بالشات المحدد (#control)
    if (message.content === '!setup_panel') {
        if (message.author.id !== OWNER_ID) return;
        const panelData = await buildControlPanelEmbed();
        await message.channel.send(panelData);
        await message.delete().catch(() => {});
    }

    if (message.content === '!reset') {
        if (message.author.id !== OWNER_ID) {
            return message.reply('❌ هذا الأمر مخصص لصاحب البوت فقط!');
        }

        userVoiceActivity.clear();
        for (const guild of client.guilds.cache.values()) {
            for (const channel of guild.channels.cache.values()) {
                if (channel.isVoiceBased()) {
                    for (const [memberId, member] of channel.members) {
                        if (!member.user.bot) {
                            userVoiceActivity.set(memberId, { voiceTime: 0, joinTimestamp: Date.now() });
                        }
                    }
                }
            }
        }

        await updateHourlyLeaderboard();
        return message.reply('🔄 **تم تصفير جميع النقاط بنجاح!**');
    }
});

// الأحداث والتنقل بالصوت
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    const member = newState.member || oldState.member;

    if (!member || member.user.bot) return;

    const userId = member.id;
    const userData = userVoiceActivity.get(userId) || { voiceTime: 0, joinTimestamp: null };

    if (!oldState.channelId && newState.channelId) {
        userData.joinTimestamp = Date.now();
        userVoiceActivity.set(userId, userData);
    } else if (oldState.channelId && !newState.channelId) {
        if (userData.joinTimestamp) {
            userData.voiceTime += (Date.now() - userData.joinTimestamp);
            userData.joinTimestamp = null;
            userVoiceActivity.set(userId, userData);
        }
    }

    if (newState.channelId && newState.channelId === process.env.JOIN_CHANNEL_ID) {
        try {
            const tempChannel = await guild.channels.create({
                name: `🔊 | ${member.user.username}`,
                type: ChannelType.GuildVoice,
                parent: process.env.CATEGORY_ID || null,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                    },
                    {
                        id: member.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels],
                    }
                ]
            });

            tempChannels.set(tempChannel.id, member.id);
            await member.voice.setChannel(tempChannel).catch(() => {});

            // إرسال اللوحة داخل الروم الصوتية عند إنشائها تلقائياً
            const panelData = await buildControlPanelEmbed();
            await tempChannel.send({ content: `<@${member.id}>`, ...panelData });

        } catch (error) {
            console.error('خطأ أثناء إنشاء الروم:', error);
        }
    }

    if (oldState.channelId && tempChannels.has(oldState.channelId)) {
        const channel = oldState.guild.channels.cache.get(oldState.channelId);
        if (channel && channel.members.size === 0) {
            tempChannels.delete(channel.id);
            await channel.delete().catch(() => {});
        }
    }
});

// التعامل مع التفاعلات والأزرار
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId === 'btn_my_points') {
        const totalMs = getUserTotalTime(interaction.user.id);
        const formatted = formatTime(totalMs);
        return interaction.reply({ content: `🎙️ **مجموع تواجدك الصوتي الحالي:** \`${formatted}\``, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === 'btn_reset_points') {
        if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '❌ هذا الزر مخصص لصاحب البوت فقط!', ephemeral: true });
        userVoiceActivity.clear();
        await updateHourlyLeaderboard();
        return interaction.reply({ content: '🔄 تم تصفير جميع النقاط بنجاح!', ephemeral: true });
    }

    const memberVoiceChannel = interaction.member.voice.channel;
    if (!memberVoiceChannel || !tempChannels.has(memberVoiceChannel.id)) {
        return interaction.reply({ content: '❌ يجب أن تكون داخل رومك المؤقت لاستخدام اللوحة!', ephemeral: true });
    }

    const ownerId = tempChannels.get(memberVoiceChannel.id);
    if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '❌ أنت لست صاحب هذا الروم!', ephemeral: true });
    }

    if (interaction.isButton()) {
        if (interaction.customId !== 'btn_rename' && interaction.customId !== 'btn_limit') {
            await interaction.deferReply({ ephemeral: true }).catch(() => {});
        }

        switch (interaction.customId) {
            case 'btn_lock':
                await memberVoiceChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
                await interaction.editReply({ content: '🔒 تم قفل الروم.' });
                break;
            case 'btn_unlock':
                await memberVoiceChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
                await interaction.editReply({ content: '🔓 تم فتح الروم.' });
                break;
            case 'btn_hide':
                await memberVoiceChannel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
                await interaction.editReply({ content: '🙈 تم إخفاء الروم.' });
                break;
            case 'btn_show':
                await memberVoiceChannel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
                await interaction.editReply({ content: '👁️ تم إظهار الروم.' });
                break;
            case 'btn_rename': {
                const modal = new ModalBuilder().setCustomId('modal_rename').setTitle('تغيير اسم الروم');
                const input = new TextInputBuilder().setCustomId('new_name').setLabel('الاسم الجديد').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);
                break;
            }
            case 'btn_limit': {
                const modal = new ModalBuilder().setCustomId('modal_limit').setTitle('تحديد عدد الأعضاء');
                const input = new TextInputBuilder().setCustomId('new_limit').setLabel('العدد (0 للـ غير محدود)').setStyle(TextInputStyle.Short).setPlaceholder('مثال: 5').setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);
                break;
            }
        }
    }

    if (interaction.isModalSubmit()) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        if (interaction.customId === 'modal_rename') {
            const newName = interaction.fields.getTextInputValue('new_name');
            await memberVoiceChannel.setName(newName).catch(() => {});
            await interaction.editReply({ content: `✅ تم تغيير اسم الروم إلى: **${newName}**` });
        }
        if (interaction.customId === 'modal_limit') {
            const limit = parseInt(interaction.fields.getTextInputValue('new_limit'));
            if (isNaN(limit) || limit < 0 || limit > 99) return interaction.editReply({ content: '❌ يرجى إدخال رقم صحيح.' });
            await memberVoiceChannel.setUserLimit(limit).catch(() => {});
            await interaction.editReply({ content: `✅ تم تغيير حد الأعضاء إلى: **${limit}**` });
        }
    }
});

// Server Express
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(port, '0.0.0.0', () => console.log(`🌐 Web server running on port ${port}`));

client.login(process.env.TOKEN);
