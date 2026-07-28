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
    AttachmentBuilder,
    UserSelectMenuBuilder,
    RoleSelectMenuBuilder
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

// حفظ بيانات الرومات الموقتة
const tempChannels = new Map(); // voiceChannelId -> { ownerId, textChannelId }
const userVoiceActivity = new Map(); 
const leaderboardMessages = new Map(); // channelId -> messageId

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

    updateLeaderboard();
    setInterval(() => {
        updateLeaderboard();
    }, 60 * 60 * 1000); 
});

// 🎨 تصميم لوحة تحكم الروم الصوتي (المطابقة للوحة المطلوب ظهورها)
function buildControlPanelEmbed() {
    const embed = new EmbedBuilder()
        .setColor(0x1E1F22)
        .setTitle('Temp Voice Control Panel')
        .setDescription('Use these controls while you are inside your temporary voice room.\n\n**Room Controls**')
        .setFooter({ text: 'Mythic Control System' });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_lock').setLabel('Lock').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_unlock').setLabel('Open').setEmoji('🔓').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_hide').setLabel('Hide').setEmoji('👁️‍🗨️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_show').setLabel('Show').setEmoji('👁️').setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_rename').setLabel('Rename Room').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_limit').setLabel('Change Limit').setEmoji('👥').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_region').setLabel('Change Region').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_status').setLabel('Voice Status').setEmoji('💬').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_music').setLabel('Music Bot').setEmoji('🎵').setStyle(ButtonStyle.Secondary)
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

    const row5 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_remove_role').setLabel('Remove Role').setEmoji('➖').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_view_roles').setLabel('View Allowed Roles').setEmoji('📜').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2, row3, row4, row5] };
}

// ✨ تنسيق الوقت للوحة الصدارة
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

function getLevelInfo(totalMs) {
    const totalMinutes = Math.floor(totalMs / (1000 * 60));
    const level = Math.floor(totalMinutes / 5);

    const tier = Math.floor(level / 10);
    const colorPalette = [
        '#00f2fe', '#00ff87', '#ff007f', '#ffaa00', '#9d00ff', '#ff3b30'
    ];

    const activeColor = colorPalette[Math.min(tier, colorPalette.length - 1)];
    return { level, activeColor };
}

async function generateLeaderboardCanvas(topUsers, guild) {
    const width = 1000;
    const height = 550;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#080a12';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`👑 ${guild.name || 'LEADERBOARD'}`, 35, 45);

    ctx.fillStyle = '#6b7280';
    ctx.font = '13px sans-serif';
    ctx.fillText('LIVE VOICE RANKINGS • UPDATED HOURLY', 35, 68);

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

        ctx.fillStyle = activeColor;
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(`LVL ${level}`, 50, 310);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(formatTime(top1.time), 130, 310);

        ctx.fillStyle = activeColor;
        ctx.beginPath();
        ctx.roundRect(50, 335, 250, 6, 3);
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

// 🔄 تحديث لوحة الصدارة فقط في رومات الصدارة المحددة
async function updateLeaderboard() {
    const channelIds = [
        process.env.LEADERBOARD_CHANNEL_ID_1,
        process.env.LEADERBOARD_CHANNEL_ID_2
    ].filter(Boolean);

    if (channelIds.length === 0) return;

    for (const channelId of channelIds) {
        const channel = client.channels.cache.get(channelId);
        if (!channel) continue;

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
            content: '⚡ **تحديث مستمر للفل والصدارة كل ساعة**',
            files: [attachment],
            components: [row]
        };

        try {
            const existingMsgId = leaderboardMessages.get(channelId);
            if (existingMsgId) {
                const msg = await channel.messages.fetch(existingMsgId).catch(() => null);
                if (msg) {
                    await msg.edit(messageContent);
                    continue;
                }
            }

            const newMsg = await channel.send(messageContent);
            leaderboardMessages.set(channelId, newMsg.id);
        } catch (error) {
            console.error(`Error updating leaderboard in channel ${channelId}:`, error);
        }
    }
}

// 🔊 إنشاء الروم الصوتي + إرسال لوحة التحكم الزرقاء الصحيحة
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

    // 🟢 دخول روم الإنشاء
    if (newState.channelId && newState.channelId === process.env.JOIN_CHANNEL_ID) {
        try {
            const parentCategory = process.env.CATEGORY_ID || null;

            // 1. إنشاء الروم الصوتي
            const tempVoiceChannel = await guild.channels.create({
                name: `🔊 | ${member.user.username}`,
                type: ChannelType.GuildVoice,
                parent: parentCategory,
                permissionOverwrites: [
                    { id: guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
                    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels] }
                ]
            });

            // 2. إنشاء روم التحكم النصي (#control)
            const tempTextChannel = await guild.channels.create({
                name: `control-${member.user.username}`,
                type: ChannelType.GuildText,
                parent: parentCategory,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
                ]
            });

            // حفظ البيانات
            tempChannels.set(tempVoiceChannel.id, {
                ownerId: member.id,
                textChannelId: tempTextChannel.id
            });

            // نقل العضو للروم الصوتي
            await member.voice.setChannel(tempVoiceChannel).catch(() => {});

            // 3. إرسال لوحة التحكم الخفيفة (Lock, Unlock, Rename...)
            const panelData = buildControlPanelEmbed();
            await tempTextChannel.send({
                content: `👋 أهلاً بك <@${member.id}>! يمكنك التحكم برومك من هنا:`,
                ...panelData
            });

        } catch (error) {
            console.error('خطأ أثناء إنشاء الروم:', error);
        }
    }

    // 🔴 حذف الروم الصوتي وروم التحكم عند المغادرة
    if (oldState.channelId && tempChannels.has(oldState.channelId)) {
        const voiceChannel = oldState.guild.channels.cache.get(oldState.channelId);
        if (voiceChannel && voiceChannel.members.size === 0) {
            const channelData = tempChannels.get(oldState.channelId);

            if (channelData && channelData.textChannelId) {
                const textChannel = oldState.guild.channels.cache.get(channelData.textChannelId);
                if (textChannel) await textChannel.delete().catch(() => {});
            }

            tempChannels.delete(voiceChannel.id);
            await voiceChannel.delete().catch(() => {});
        }
    }
});

// 🎮 التحكم بالأزرار والقوائم
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId === 'btn_my_points') {
        const totalMs = getUserTotalTime(interaction.user.id);
        const { level } = getLevelInfo(totalMs);
        return interaction.reply({ content: `⚡ **المستوى الحالي:** \`LVL ${level}\`\n🎙️ **الوقت:** \`${formatTime(totalMs)}\``, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === 'btn_reset_points') {
        if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '❌ هذا الزر للمالك فقط!', ephemeral: true });
        userVoiceActivity.clear();
        await updateLeaderboard();
        return interaction.reply({ content: '🔄 تم تصفير البيانات بنجاح!', ephemeral: true });
    }

    let voiceChannel = interaction.member.voice?.channel;
    let channelInfo = null;

    if (voiceChannel && tempChannels.has(voiceChannel.id)) {
        channelInfo = tempChannels.get(voiceChannel.id);
    } else {
        for (const [vId, data] of tempChannels.entries()) {
            if (data.textChannelId === interaction.channelId) {
                voiceChannel = interaction.guild.channels.cache.get(vId);
                channelInfo = data;
                break;
            }
        }
    }

    if (!voiceChannel || !channelInfo) return;

    if (interaction.user.id !== channelInfo.ownerId) {
        return interaction.reply({ content: '❌ أنت لست صاحب هذا الروم!', ephemeral: true });
    }

    if (interaction.isButton()) {
        const customId = interaction.customId;

        if (customId === 'btn_rename') {
            const modal = new ModalBuilder().setCustomId('modal_rename').setTitle('Rename Room');
            const input = new TextInputBuilder().setCustomId('input_name').setLabel('New Room Name').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        if (customId === 'btn_limit') {
            const modal = new ModalBuilder().setCustomId('modal_limit').setTitle('Change Room Limit');
            const input = new TextInputBuilder().setCustomId('input_limit').setLabel('Limit (0 for unlimited)').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        if (customId === 'btn_status') {
            const modal = new ModalBuilder().setCustomId('modal_status').setTitle('Voice Status');
            const input = new TextInputBuilder().setCustomId('input_status').setLabel('Set Voice Status').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        if (['btn_kick', 'btn_block', 'btn_unblock', 'btn_trust', 'btn_untrust'].includes(customId)) {
            const userSelect = new UserSelectMenuBuilder().setCustomId(`select_${customId}`).setPlaceholder('اختر العضو المحدد...');
            return interaction.reply({ components: [new ActionRowBuilder().addComponents(userSelect)], ephemeral: true });
        }

        if (['btn_allow_role', 'btn_remove_role'].includes(customId)) {
            const roleSelect = new RoleSelectMenuBuilder().setCustomId(`select_${customId}`).setPlaceholder('اختر الرتبة...');
            return interaction.reply({ components: [new ActionRowBuilder().addComponents(roleSelect)], ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        switch (customId) {
            case 'btn_lock':
                await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
                await interaction.editReply({ content: '🔒 تم قفل الروم الصوتي.' });
                break;
            case 'btn_unlock':
                await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
                await interaction.editReply({ content: '🔓 تم فتح الروم الصوتي.' });
                break;
            case 'btn_hide':
                await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
                await interaction.editReply({ content: '👁️‍🗨️ تم إخفاء الروم الصوتي.' });
                break;
            case 'btn_show':
                await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
                await interaction.editReply({ content: '👁️ تم إظهار الروم الصوتي.' });
                break;
            case 'btn_region':
                await interaction.editReply({ content: '🌐 يمكنك تغيير المنطقة من إعدادات الروم الصوتي مباشرة.' });
                break;
            case 'btn_music':
                await interaction.editReply({ content: '🎵 يمكنك استدعاء بوت الموسيقى داخل الروم الآن.' });
                break;
            case 'btn_view_roles': {
                const overwrites = voiceChannel.permissionOverwrites.cache.filter(o => o.type === 1);
                const rolesList = overwrites.map(o => `<@&${o.id}>`).join(', ') || 'لا توجد رتب مخصصة حالياً.';
                await interaction.editReply({ content: `📜 **الرتب المسموح لها:**\n${rolesList}` });
                break;
            }
        }
    }

    if (interaction.isUserSelectMenu()) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        const targetId = interaction.values[0];
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

        if (!targetMember) return interaction.editReply({ content: '❌ تعذر العثور على العضو.' });

        switch (interaction.customId) {
            case 'select_btn_kick':
                if (targetMember.voice.channelId === voiceChannel.id) {
                    await targetMember.voice.disconnect();
                    await interaction.editReply({ content: `❌ تم طرد <@${targetId}> من الروم الصوتي.` });
                } else {
                    await interaction.editReply({ content: '⚠️ العضو ليس متواجد في رومك حالياً.' });
                }
                break;
            case 'select_btn_block':
                await voiceChannel.permissionOverwrites.edit(targetId, { Connect: false, ViewChannel: false });
                if (targetMember.voice.channelId === voiceChannel.id) await targetMember.voice.disconnect();
                await interaction.editReply({ content: `🚫 تم حظر <@${targetId}> من الروم.` });
                break;
            case 'select_btn_unblock':
                await voiceChannel.permissionOverwrites.delete(targetId);
                await interaction.editReply({ content: `🔓 تم إلغاء حظر <@${targetId}>.` });
                break;
            case 'select_btn_trust':
                await voiceChannel.permissionOverwrites.edit(targetId, { Connect: true, Speak: true, ViewChannel: true });
                await interaction.editReply({ content: `🟢 تم إعطاء الثقة لـ <@${targetId}>.` });
                break;
            case 'select_btn_untrust':
                await voiceChannel.permissionOverwrites.delete(targetId);
                await interaction.editReply({ content: `🔴 تم إزالة الثقة عن <@${targetId}>.` });
                break;
        }
    }

    if (interaction.isRoleSelectMenu()) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        const roleId = interaction.values[0];

        if (interaction.customId === 'select_btn_allow_role') {
            await voiceChannel.permissionOverwrites.edit(roleId, { Connect: true, ViewChannel: true });
            await interaction.editReply({ content: `👑 تم السماح لرتبة <@&${roleId}> بالدخول.` });
        }
        if (interaction.customId === 'select_btn_remove_role') {
            await voiceChannel.permissionOverwrites.delete(roleId);
            await interaction.editReply({ content: `➖ تم إزالة الصلاحية عن رتبة <@&${roleId}>.` });
        }
    }

    if (interaction.isModalSubmit()) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        if (interaction.customId === 'modal_rename') {
            const name = interaction.fields.getTextInputValue('input_name');
            await voiceChannel.setName(name).catch(() => {});
            await interaction.editReply({ content: `✏️ تم تغيير اسم الروم إلى: **${name}**` });
        }
        if (interaction.customId === 'modal_limit') {
            const limit = parseInt(interaction.fields.getTextInputValue('input_limit'));
            if (isNaN(limit) || limit < 0 || limit > 99) return interaction.editReply({ content: '❌ يرجى إدخال رقم صحيح بين 0 و 99.' });
            await voiceChannel.setUserLimit(limit).catch(() => {});
            await interaction.editReply({ content: `👥 تم تغيير حد الأعضاء إلى: **${limit}**` });
        }
        if (interaction.customId === 'modal_status') {
            const status = interaction.fields.getTextInputValue('input_status');
            await interaction.editReply({ content: `💬 تم تعيين الحالة إلى: **${status}**` });
        }
    }
});

// Express Server
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot status: Active!'));
app.listen(port, '0.0.0.0', () => console.log(`🌐 Server running on port ${port}`));

client.login(process.env.TOKEN);
