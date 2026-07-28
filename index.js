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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// تخزين ملكية الرومات المؤقتة، الأعضاء المختارين، والمؤقتات
const tempChannels = new Map();
const selectedUsers = new Map();
const roomIntervals = new Map();

// تخزين بيانات الصوت فقط للتفاعل الجديد
const userVoiceActivity = new Map(); // userId => { voiceTime, joinTimestamp }
let leaderboardMessageId = null;     // لتعديل نفس الرسالة كل ساعة

client.once('ready', () => {
    console.log(`🤖 البوت متصل باسم: ${client.user.tag}`);

    // تشغيل تحديث التوب 10 فور تشغيل البوت وتكراره كل ساعة (60 دقيقة)
    updateHourlyLeaderboard();
    setInterval(() => {
        updateHourlyLeaderboard();
    }, 60 * 60 * 1000);
});

// دالة لتحديث لوحة التحكم والقائمة المنسدلة للرومات المؤقتة
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

// دالة تتبع الوقت الصوتي
function trackVoiceTime(userId, isJoining) {
    if (!userVoiceActivity.has(userId)) {
        userVoiceActivity.set(userId, { voiceTime: 0, joinTimestamp: null });
    }
    const data = userVoiceActivity.get(userId);
    
    if (isJoining) {
        data.joinTimestamp = Date.now();
    } else if (data.joinTimestamp) {
        data.voiceTime += (Date.now() - data.joinTimestamp);
        data.joinTimestamp = null;
    }
}

// دالة تحويل الملي ثانية إلى صيغة "Xh Ym"
function formatTime(ms) {
    const totalMinutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
}

// دالة رسم اللوحة (Leaderboard Canvas) بنفس تصميم الصورة
async function generateLeaderboardCanvas(topUsers, guild) {
    const width = 1000;
    const height = 550;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // خلفية داكنة
    ctx.fillStyle = '#0d0f1b';
    ctx.fillRect(0, 0, width, height);

    // هيدر السيرفر
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(guild.name || 'Myth Server', 30, 45);
    ctx.fillStyle = '#7a7f9d';
    ctx.font = '14px sans-serif';
    ctx.fillText('Voice activity / weekly competition / live standings', 30, 68);

    // بطاقة المركز الأول (#1)
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

        // صورة البروفايل للـ #1
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

        // الوقت التراكمي للمركز الأول
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px sans-serif';
        ctx.fillText(formatTime(top1.time), 50, 310);

        // شريط تقدم بسيط للمركز الأول
        ctx.fillStyle = '#22273e';
        ctx.beginPath();
        ctx.roundRect(50, 360, 250, 8, 4);
        ctx.fill();

        ctx.fillStyle = '#e5a93b';
        ctx.beginPath();
        ctx.roundRect(50, 360, 250, 8, 4);
        ctx.fill();
    }

    // رسم باقي القائمة (من #2 إلى #10) في جدول مصغر
    const startX = 340;
    let currentY = 95;
    const cardWidth = 300;
    const cardHeight = 75;

    for (let i = 1; i < 10; i++) {
        const user = topUsers[i];
        const isRightColumn = i >= 6; // تقسيمهم لعمودين
        const colX = isRightColumn ? startX + cardWidth + 20 : startX;
        const rowY = isRightColumn ? currentY + ((i - 6) * 85) : currentY + ((i - 1) * 85);

        ctx.fillStyle = '#141829';
        ctx.beginPath();
        ctx.roundRect(colX, rowY, cardWidth, cardHeight, 10);
        ctx.fill();

        ctx.fillStyle = '#5865f2';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`#${i + 1}`, colX + 15, rowY + 30);

        if (user) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '14px sans-serif';
            const name = user.member ? user.member.displayName : 'Unknown';
            ctx.fillText(name.substring(0, 12), colX + 45, rowY + 30);

            ctx.fillStyle = '#00f2fe';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText(formatTime(user.time), colX + cardWidth - 80, rowY + 30);

            // شريط صغير تحت كل لاعب
            ctx.fillStyle = '#22273e';
            ctx.beginPath();
            ctx.roundRect(colX + 45, rowY + 45, 220, 4, 2);
            ctx.fill();

            ctx.fillStyle = '#00f2fe';
            ctx.beginPath();
            ctx.roundRect(colX + 45, rowY + 45, 120, 4, 2);
            ctx.fill();
        } else {
            ctx.fillStyle = '#4a4d68';
            ctx.font = '12px sans-serif';
            ctx.fillText('لا يوجد لاعب', colX + 45, rowY + 35);
        }
    }

    return canvas.toBuffer('image/png');
}

// دالة إرسال / تحديث التقرير كل ساعة
async function updateHourlyLeaderboard() {
    const leaderboardChannelId = process.env.LEADERBOARD_CHANNEL_ID;
    if (!leaderboardChannelId) return;

    const channel = client.channels.cache.get(leaderboardChannelId);
    if (!channel) return;

    // تحديث أوقات المتواجدين حالياً بالصوت
    const now = Date.now();
    const topData = [];

    for (const [userId, data] of userVoiceActivity.entries()) {
        let totalTime = data.voiceTime;
        if (data.joinTimestamp) {
            totalTime += (now - data.joinTimestamp);
        }
        if (totalTime > 0) {
            const member = await channel.guild.members.fetch(userId).catch(() => null);
            topData.push({ userId, time: totalTime, member });
        }
    }

    // ترتيب الأعضاء بالوقت الصوتي
    topData.sort((a, b) => b.time - a.time);

    // توليد الصورة
    const imageBuffer = await generateLeaderboardCanvas(topData, channel.guild);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' });

    // إنشاء الأزرار (نقاطي، تصفير)
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

// 1. حدث دخول الصوت والإنشاء التلقائي
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    const logChannelId = process.env.LOG_CHANNEL_ID;
    const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;
    const member = newState.member || oldState.member;

    if (!member) return;

    // تتبع التفاعل الصوتي للأعضاء
    if (newState.channelId && !oldState.channelId) {
        trackVoiceTime(member.id, true);
    } else if (!newState.channelId && oldState.channelId) {
        trackVoiceTime(member.id, false);
    } else if (newState.channelId && oldState.channelId && newState.channelId !== oldState.channelId) {
        trackVoiceTime(member.id, false);
        trackVoiceTime(member.id, true);
    }

    // إنشاء الروم تلقائياً
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

    // حذف الروم تلقائياً عند خروج الجميع
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

// 2. التحكم بالأزرار والنوافذ التفاعلية
client.on('interactionCreate', async (interaction) => {
    // التفاعل مع أزرار التوب 10 الجديد (نقاطي / تصفير)
    if (interaction.isButton() && interaction.customId === 'btn_my_points') {
        const data = userVoiceActivity.get(interaction.user.id);
        let time = data ? data.voiceTime : 0;
        if (data && data.joinTimestamp) {
            time += (Date.now() - data.joinTimestamp);
        }
        return interaction.reply({ content: `🎙️ مجموع تواجدك الصوتي: **${formatTime(time)}**`, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === 'btn_reset_points') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ هذا الأمر خاص بالإدارة فقط!', ephemeral: true });
        }
        userVoiceActivity.clear();
        await updateHourlyLeaderboard();
        return interaction.reply({ content: '🔄 تم تصفير جميع النقاط بنجاح!', ephemeral: true });
    }

    // باقي أزرار التحكم بالرومات المؤقتة
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

// 🌐 خادم Express متوافق مع Render Free
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running!');
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Web server running on port ${port}`);
});

client.login(process.env.TOKEN);
