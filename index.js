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

    // التحديث كل دقيقة
    updateLeaderboard();
    setInterval(() => {
        updateLeaderboard();
    }, 60 * 1000); 
});

// 🎨 بناء لوحة التحكم الهيبة (Temp Voice Control Panel)
async function buildControlPanelEmbed() {
    const embed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setTitle('👑 TEMPORARY VOICE CONTROL PANEL')
        .setDescription(
            '⚡ *لوحة تحكم الروم الصوتي المؤقتة - التحكم الكامل والاحترافي*\n\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
            '⚙️ **ROOM CONTROLS | إعدادات الغرفة**\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
            '👥 **MEMBER CONTROLS | إعدادات الأعضاء**'
        )
        .setFooter({ text: 'Mythic Voice System • Prestige Edition' });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_lock').setLabel('Lock').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_unlock').setLabel('Open').setEmoji('🔓').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_hide').setLabel('Hide').setEmoji('🙈').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_show').setLabel('Show').setEmoji('👁️').setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_rename').setLabel('Rename Room').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_limit').setLabel('Change Limit').setEmoji('👥').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_region').setLabel('Change Region').setEmoji('🌐').setStyle(ButtonStyle.Secondary)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_kick').setLabel('Kick Member').setEmoji('❌').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_block').setLabel('Block Member').setEmoji('🚫').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_unblock').setLabel('Unblock Member').setEmoji('🔓').setStyle(ButtonStyle.Secondary)
    );

    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_invite').setLabel('Invite Member').setEmoji('✉️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_trust').setLabel('Trust Member').setEmoji('🟢').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_untrust').setLabel('Untrust Member').setEmoji('🔴').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('btn_allow_role').setLabel('Allow Role').setEmoji('👑').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2, row3, row4] };
}

// ✨ تنسيق الوقت
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

// 👑 دالة حساب اللفل المباشر (زيادة حبة واحدة كل 5 دقائق + تغير اللون كل 10 لفل)
function getLevelInfo(totalMs) {
    const totalMinutes = Math.floor(totalMs / (1000 * 60));
    
    // لفل يزداد حبة واحدة (+1) كل 5 دقائق صوتية
    const level = Math.floor(totalMinutes / 5);

    // تغيير ألوان الهيبة كل 10 لفل
    const tier = Math.floor(level / 10);
    const colorPalette = [
        '#00f2fe', // Level 0 - 9: أزرق سماوي نيون
        '#00ff87', // Level 10 - 19: أخضر نيون
        '#ff007f', // Level 20 - 29: وردي أرجواني
        '#ffaa00', // Level 30 - 39: ذهبي
        '#9d00ff', // Level 40 - 49: بنفسجي
        '#ff3b30'  // Level 50+: أحمر ناري
    ];

    const activeColor = colorPalette[Math.min(tier, colorPalette.length - 1)];

    return { level, activeColor };
}

// 🎨 رسم لوحة الصدارة الفخمة بالهيبة والألوان بدون EXP
async function generateLeaderboardCanvas(topUsers, guild) {
    const width = 1000;
    const height = 550;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // خلفية داكنة ملكية
    ctx.fillStyle = '#080a12';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`👑 ${guild.name || 'LEADERBOARD'}`, 35, 45);

    ctx.fillStyle = '#6b7280';
    ctx.font = '13px sans-serif';
    ctx.fillText('LIVE VOICE RANKINGS • UPDATED EVERY MINUTE', 35, 68);

    // بطاقة المركز الأول (#1 Top Card)
    ctx.fillStyle = '#0f1322';
    ctx.beginPath();
    ctx.roundRect(30, 95, 290, 420, 18);
    ctx.fill();

    const top1 = topUsers[0];
    if (top1) {
        const { level, activeColor } = getLevelInfo(top1.time);

        ctx.fillStyle = '#e5a93b';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText('👑 #1', 50, 135);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(top1.member ? top1.member.displayName.substring(0, 12) : 'Unknown', 110, 135);

        try {
            const avatarUrl = top1.member ? top1.member.user.displayAvatarURL({ extension: 'png', size: 128 }) : '';
            if (avatarUrl) {
                const avatar = await loadImage(avatarUrl);
                ctx.save();
                ctx.beginPath();
                ctx.arc(175, 215, 52, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(avatar, 123, 163, 104, 104);
                ctx.restore();
            }
        } catch (e) {}

        // عرض اللفل والوقت
        ctx.fillStyle = activeColor;
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(`LVL ${level}`, 50, 310);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(formatTime(top1.time), 130, 310);

        // خط تجميلي فخم يتغير لونه حسب المستوى
        ctx.fillStyle = activeColor;
        ctx.beginPath();
        ctx.roundRect(50, 335, 250, 6, 3);
        ctx.fill();
    }

    // باقي المراكز (#2 - #10)
    const startX = 340;
    let currentY = 95;
    const cardWidth = 300;
    const cardHeight = 75;

    for (let i = 1; i < 10; i++) {
        const user = topUsers[i];
        const isRightColumn = i >= 6;
        const colX = isRightColumn ? startX + cardWidth + 20 : startX;
        const rowY = isRightColumn ? currentY + ((i - 6) * 85) : currentY + ((i - 1) * 85);

        ctx.fillStyle = '#0f1322';
        ctx.beginPath();
        ctx.roundRect(colX, rowY, cardWidth, cardHeight, 12);
        ctx.fill();

        ctx.fillStyle = '#4f46e5';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`#${i + 1}`, colX + 12, rowY + 43);

        if (user) {
            const { level, activeColor } = getLevelInfo(user.time);

            try {
                const avatarUrl = user.member ? user.member.user.displayAvatarURL({ extension: 'png', size: 64 }) : '';
                if (avatarUrl) {
                    const avatar = await loadImage(avatarUrl);
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(colX + 58, rowY + 37, 18, 0, Math.PI * 2);
                    ctx.closePath();
                    ctx.clip();
                    ctx.drawImage(avatar, colX + 40, rowY + 19, 36, 36);
                    ctx.restore();
                }
            } catch (e) {}

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 13px sans-serif';
            const name = user.member ? user.member.displayName : 'Unknown';
            ctx.fillText(name.substring(0, 9), colX + 82, rowY + 30);

            ctx.fillStyle = activeColor;
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(`LVL ${level}`, colX + 150, rowY + 30);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(formatTime(user.time), colX + cardWidth - 75, rowY + 30);

            // خط سفلي أنيق لكل بطاقة
            ctx.fillStyle = activeColor;
            ctx.beginPath();
            ctx.roundRect(colX + 82, rowY + 45, 195, 4, 2);
            ctx.fill();

        } else {
            ctx.fillStyle = '#374151';
            ctx.font = '12px sans-serif';
            ctx.fillText('لا يوجد لاعب', colX + 85, rowY + 42);
        }
    }

    return canvas.toBuffer('image/png');
}

async function updateLeaderboard() {
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
        new ButtonBuilder().setCustomId('btn_my_points').setLabel('نقاطي ولفلي').setStyle(ButtonStyle.Secondary).setEmoji('⚡'),
        new ButtonBuilder().setCustomId('btn_reset_points').setLabel('تصفير').setStyle(ButtonStyle.Danger).setEmoji('🔄')
    );

    const messageContent = {
        content: '⚡ **تحديث مستمر للفل والصدارة كل دقيقة**',
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

        await updateLeaderboard();
        return message.reply('🔄 **تم تصفير النقاط واللفلات بنجاح!**');
    }
});

// الأحداث والتواجد بالصوت
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
        const { level } = getLevelInfo(totalMs);
        const formatted = formatTime(totalMs);

        return interaction.reply({ 
            content: `⚡ **المستوى الحالي:** \`LVL ${level}\`\n🎙️ **إجمالي الوقت:** \`${formatted}\``, 
            ephemeral: true 
        });
    }

    if (interaction.isButton() && interaction.customId === 'btn_reset_points') {
        if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '❌ هذا الزر مخصص لصاحب البوت فقط!', ephemeral: true });
        userVoiceActivity.clear();
        await updateLeaderboard();
        return interaction.reply({ content: '🔄 تم تصفير جميع النقاط واللفلات بنجاح!', ephemeral: true });
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
