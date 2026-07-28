const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    StringSelectMenuBuilder,
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

// 👑 اكتب آيدي حسابك الشخصي هنا (حتى يكون التصفير حصري لك أنت فقط)
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

// تخزين ملكية الرومات المؤقتة والأعضاء
const tempChannels = new Map();
const selectedUsers = new Map();

// تخزين النقاط/الوقت لكل مستخدم بالملي ثانية
const userVoiceActivity = new Map(); // userId => { voiceTime: total_ms, joinTimestamp: timestamp }
let leaderboardMessageId = null;

client.once('ready', async () => {
    console.log(`🤖 البوت متصل باسم: ${client.user.tag}`);

    // 1. تسجيل كل شخص متواجد بالصوت فور تشغيل البوت
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

    // 2. تحديث لوحة التوب 10 تلقائياً كل دقيقة
    updateHourlyLeaderboard();
    setInterval(() => {
        updateHourlyLeaderboard();
    }, 60 * 1000); 
});

// دالة لتحديث لوحة التحكم للرومات المؤقتة
async function updateControlPanel(channel, ownerId) {
    const members = channel.members.filter(m => m.id !== ownerId);

    const options = members.size > 0 ? members.map(m => ({
        label: m.displayName.substring(0, 25),
        value: m.id,
        description: 'تحكم في العضو'
    })) : [{ label: 'لا توجد أعضاء أخرى بالروم', value: 'none', description: 'فارغ' }];

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_lock').setLabel('قفل').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_unlock').setLabel('فتح').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_hide').setLabel('اخفى').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_show').setLabel('إظهار').setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_allow').setLabel('سماح اداري').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_deny').setLabel('ازالة اداري').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_kick').setLabel('طرد').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_limit').setLabel('حد').setStyle(ButtonStyle.Secondary)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_name').setLabel('الاسم').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_mute').setLabel('ميوت').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_unmute').setLabel('فك').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_delete').setLabel('حذف').setStyle(ButtonStyle.Danger)
    );

    const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_target')
            .setPlaceholder('اختر العضو لتطبيق الصلاحيات أو الميوت أو الطرد...')
            .addOptions(options)
    );

    return { components: [row1, row2, row3, selectMenu] };
}

// ✨ دالة تنسيق الوقت الذكية (تخفي الثواني عند وصول ساعة فأكثر)
function formatTime(ms) {
    if (!ms || ms < 1000) return '0s';

    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    const parts = [];

    // إذا وصل لساعة فأكثر -> نلغي الثواني
    if (days > 0 || hours > 0) {
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
    } 
    // إذا أقل من ساعة -> نعرض الدقائق والثواني
    else {
        if (minutes > 0) parts.push(`${minutes}m`);
        if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    }

    return parts.join(' ');
}

// دالة حساب الوقت الكلي لشخص
function getUserTotalTime(userId) {
    const data = userVoiceActivity.get(userId);
    if (!data) return 0;
    
    let currentSession = 0;
    if (data.joinTimestamp) {
        currentSession = Date.now() - data.joinTimestamp;
    }
    return data.voiceTime + currentSession;
}

// دالة رسم Canvas مع إظهار صور جميع الأعضاء
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

    // #1 Card
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

    // باقي الأعضاء #2 إلى #10 (مع صور البروفايل الخاصة بهم)
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
            // رسم صورة البروفايل للمراكز من 2 إلى 10
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

// دالة التحديث
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
        content: '⏳ **سيتم التحديث خلال دقيقة**',
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

// أمر تصفير نصي (!reset) لك أنت فقط
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

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

// حدث التواجد بالصوت
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    const logChannelId = process.env.LOG_CHANNEL_ID;
    const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;
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

            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
                    .setTitle('Create Temporary Channel')
                    .setDescription(`**Channel:** \`${tempChannel.name}\`\n**By:** \`${member.user.tag}\`\n**In:** <#${tempChannel.id}>`)
                    .setTimestamp();
                logChannel.send({ embeds: [embed] }).catch(() => {});
            }

            const panel = await updateControlPanel(tempChannel, member.id);
            const controlMsg = await tempChannel.send({
                content: `<@${member.id}> أهلاً بك في رومك المؤقت، استخدم الأزرار والقائمة أدناه للتحكم:`,
                ...panel
            });

            tempChannel.controlMessageId = controlMsg.id;
        } catch (error) {
            console.error('خطأ أثناء إنشاء الروم:', error);
        }
    }

    if (oldState.channelId && tempChannels.has(oldState.channelId)) {
        const channel = oldState.guild.channels.cache.get(oldState.channelId);
        if (channel && channel.members.size === 0) {
            const channelName = channel.name;
            tempChannels.delete(channel.id);
            selectedUsers.delete(channel.id);
            await channel.delete().catch(() => {});

            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('Delete Temporary Channel')
                    .setDescription(`**Channel:** \`${channelName}\``)
                    .setTimestamp();
                logChannel.send({ embeds: [embed] }).catch(() => {});
            }
        }
    }
});

// التعامل مع الأزرار والتفاعلات
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId === 'btn_my_points') {
        const totalMs = getUserTotalTime(interaction.user.id);
        const formatted = formatTime(totalMs);
        
        return interaction.reply({ 
            content: `🎙️ **مجموع تواجدك الصوتي الحالي:** \`${formatted}\``, 
            ephemeral: true 
        });
    }

    // زر التصفير (مفعل فقط للآيدي الخاص بك)
    if (interaction.isButton() && interaction.customId === 'btn_reset_points') {
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: '❌ هذا الزر مخصص لصاحب البوت فقط!', ephemeral: true });
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
        return interaction.reply({ content: '🔄 تم تصفير جميع النقاط بنجاح!', ephemeral: true });
    }

    const channel = interaction.channel;
    if (!channel || !tempChannels.has(channel.id)) return;
    const ownerId = tempChannels.get(channel.id);

    if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '❌ أنت لست صاحب هذا الروم!', ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_target') {
        const targetId = interaction.values[0];
        selectedUsers.set(channel.id, targetId);
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
        const name = targetMember ? targetMember.displayName : targetId;
        return interaction.reply({ content: `✅ تم اختيار العضو: **${name}**`, ephemeral: true });
    }

    if (interaction.isButton()) {
        if (interaction.customId !== 'btn_name' && interaction.customId !== 'btn_limit') {
            await interaction.deferReply({ ephemeral: true }).catch(() => {});
        }

        switch (interaction.customId) {
            case 'btn_lock':
                await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
                await interaction.editReply({ content: '🔒 تم قفل الروم.' });
                break;
            case 'btn_unlock':
                await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
                await interaction.editReply({ content: '🔓 تم فتح الروم.' });
                break;
            case 'btn_hide':
                await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
                await interaction.editReply({ content: '👻 تم إخفاء الروم.' });
                break;
            case 'btn_show':
                await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
                await interaction.editReply({ content: '👁️ تم إظهار الروم.' });
                break;
            case 'btn_name': {
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
            case 'btn_delete':
                tempChannels.delete(channel.id);
                await interaction.editReply({ content: '🗑️ جاري حذف الروم...' });
                await channel.delete().catch(() => {});
                break;
        }
    }

    if (interaction.isModalSubmit()) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        if (interaction.customId === 'modal_rename') {
            const newName = interaction.fields.getTextInputValue('new_name');
            await channel.setName(newName).catch(() => {});
            await interaction.editReply({ content: `✅ تم تغيير اسم الروم إلى: **${newName}**` });
        }
        if (interaction.customId === 'modal_limit') {
            const limit = parseInt(interaction.fields.getTextInputValue('new_limit'));
            if (isNaN(limit) || limit < 0 || limit > 99) return interaction.editReply({ content: '❌ يرجى إدخال رقم صحيح.' });
            await channel.setUserLimit(limit).catch(() => {});
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
