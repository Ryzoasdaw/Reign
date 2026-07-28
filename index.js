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

const tempVoiceChannels = new Map(); 
const userVoiceActivity = new Map(); 
const leaderboardMessages = new Map(); 

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
    setInterval(() => updateLeaderboard(), 60 * 60 * 1000); 
});

function buildTempRoomControlUI(memberMention) {
    const content = `أهلاً بك في رومك المؤقت، ${memberMention} استخدم الأزرار والقائمة أدناه للتحكم:`;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_show').setLabel('إظهار').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_hide').setLabel('إخفاء').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_unlock').setLabel('فتح').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_lock').setLabel('قفل').setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_limit').setLabel('حد').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_kick').setLabel('طرد').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_remove_role').setLabel('إزالة إداري').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_allow_role').setLabel('سماح إداري').setStyle(ButtonStyle.Secondary)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_delete').setLabel('حذف').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('btn_unblock').setLabel('فك').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_block').setLabel('ميوت').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_rename').setLabel('الاسم').setStyle(ButtonStyle.Secondary)
    );

    const userSelect = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
            .setCustomId('select_room_action')
            .setPlaceholder('...اختر العضو لتطبيق الصلاحيات أو الميوت أو الطرد')
    );

    return { content, components: [row1, row2, row3, userSelect] };
}

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
    const colorPalette = ['#00f2fe', '#00ff87', '#ff007f', '#ffaa00', '#9d00ff', '#ff3b30'];
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
            console.error(`Error updating leaderboard:`, error);
        }
    }
}

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
            const parentCategory = process.env.CATEGORY_ID || null;

            const tempVoiceChannel = await guild.channels.create({
                name: `🔊 | ${member.user.username}`,
                type: ChannelType.GuildVoice,
                parent: parentCategory,
                permissionOverwrites: [
                    { id: guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
                    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels] }
                ]
            });

            tempVoiceChannels.set(tempVoiceChannel.id, member.id);
            await member.voice.setChannel(tempVoiceChannel).catch(() => {});

            const welcomeData = buildTempRoomControlUI(`<@${member.id}>`);
            await tempVoiceChannel.send(welcomeData).catch(() => {});

        } catch (error) {
            console.error('خطأ أثناء إنشاء الروم الصوتي:', error);
        }
    }

    if (oldState.channelId && tempVoiceChannels.has(oldState.channelId)) {
        const voiceChannel = oldState.guild.channels.cache.get(oldState.channelId);
        if (voiceChannel && voiceChannel.members.size === 0) {
            tempVoiceChannels.delete(voiceChannel.id);
            await voiceChannel.delete().catch(() => {});
        }
    }
});

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

    const userVoiceChannel = interaction.member.voice?.channel;

    if (interaction.isButton() || interaction.isUserSelectMenu() || interaction.isRoleSelectMenu() || interaction.isModalSubmit()) {
        if (!userVoiceChannel || !tempVoiceChannels.has(userVoiceChannel.id)) {
            return interaction.reply({ content: '⚠️ يجب أن تكون متواجداً داخل رومك الصوتي المؤقت لاستخدام اللوحة!', ephemeral: true });
        }

        const roomOwnerId = tempVoiceChannels.get(userVoiceChannel.id);
        if (interaction.user.id !== roomOwnerId) {
            return interaction.reply({ content: '❌ أنت لست صاحب هذا الروم الصوتي المؤقت!', ephemeral: true });
        }
    }

    const voiceChannel = userVoiceChannel;

    if (interaction.isButton()) {
        const customId = interaction.customId;

        if (customId === 'btn_rename') {
            const modal = new ModalBuilder().setCustomId('modal_rename').setTitle('تغيير اسم الروم');
            const input = new TextInputBuilder().setCustomId('input_name').setLabel('الاسم الجديد').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        if (customId === 'btn_limit') {
            const modal = new ModalBuilder().setCustomId('modal_limit').setTitle('تغيير حد الأعضاء');
            const input = new TextInputBuilder().setCustomId('input_limit').setLabel('العدد (0 للمفتوح)').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        if (customId === 'btn_delete') {
            await interaction.reply({ content: '🗑️ جاري حذف الروم...', ephemeral: true });
            tempVoiceChannels.delete(voiceChannel.id);
            return voiceChannel.delete().catch(() => {});
        }

        // أزرار الطرد والميوت والفك أصبحت تفتح قائمة لاختيار الأعضاء (UserSelectMenu)
        if (['btn_kick', 'btn_block', 'btn_unblock'].includes(customId)) {
            const userSelect = new UserSelectMenuBuilder().setCustomId(`select_${customId}`).setPlaceholder('...اختر العضو المحدد');
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
                await interaction.editReply({ content: '🔒 تم قفل رومك الصوتي.' });
                break;
            case 'btn_unlock':
                await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
                await interaction.editReply({ content: '🔓 تم فتح رومك الصوتي.' });
                break;
            case 'btn_hide':
                await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
                await interaction.editReply({ content: '👁️‍🗨️ تم إخفاء رومك الصوتي.' });
                break;
            case 'btn_show':
                await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
                await interaction.editReply({ content: '👁️ تم إظهار رومك الصوتي.' });
                break;
        }
    }

    if (interaction.isUserSelectMenu()) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        const targetId = interaction.values[0];
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

        if (!targetMember) return interaction.editReply({ content: '❌ تعذر العثور على العضو.' });

        if (interaction.customId === 'select_room_action' || interaction.customId === 'select_btn_kick') {
            if (targetMember.voice.channelId === voiceChannel.id) {
                await targetMember.voice.disconnect();
                await interaction.editReply({ content: `❌ تم طرد <@${targetId}> من الروم الصوتي.` });
            } else {
                await interaction.editReply({ content: '⚠️ العضو ليس متواجد في رومك حالياً.' });
            }
        } else if (interaction.customId === 'select_btn_block') {
            await voiceChannel.permissionOverwrites.edit(targetId, { Connect: false, ViewChannel: false });
            if (targetMember.voice.channelId === voiceChannel.id) await targetMember.voice.disconnect();
            await interaction.editReply({ content: `🚫 تم ميوت/حظر <@${targetId}> من رومك المؤقت.` });
        } else if (interaction.customId === 'select_btn_unblock') {
            await voiceChannel.permissionOverwrites.delete(targetId);
            await interaction.editReply({ content: `🔓 تم إلغاء الميوت/الحظر عن <@${targetId}>.` });
        }
    }

    if (interaction.isRoleSelectMenu()) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        const roleId = interaction.values[0];

        if (interaction.customId === 'select_btn_allow_role') {
            await voiceChannel.permissionOverwrites.edit(roleId, { Connect: true, ViewChannel: true });
            await interaction.editReply({ content: `👑 تم إعطاء السماح لرتبة <@&${roleId}>.` });
        }
        if (interaction.customId === 'select_btn_remove_role') {
            await voiceChannel.permissionOverwrites.delete(roleId);
            await interaction.editReply({ content: `➖ تم إزالة السماح عن رتبة <@&${roleId}>.` });
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
    }
});

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot status: Active!'));
app.listen(port, '0.0.0.0', () => console.log(`🌐 Server running on port ${port}`));

client.login(process.env.TOKEN);
