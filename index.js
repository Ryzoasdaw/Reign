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
    ChannelType
} = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// تخزين ملكية الرومات المؤقتة، الأعضاء المختارين، والمؤقتات
const tempChannels = new Map();
const selectedUsers = new Map();
const roomIntervals = new Map();

client.on('ready', () => {
    console.log(`🤖 البوت متصل باسم: ${client.user.tag}`);
});

// دالة لتحديث لوحة التحكم والقائمة المنسدلة
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
        new ButtonBuilder().setCustomId('btn_allow').setLabel('سماح').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_deny').setLabel('منع').setStyle(ButtonStyle.Secondary),
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
            .setPlaceholder('اختر العضو لتطبيق الميوت أو الطرد أو السماح...')
            .addOptions(options)
    );

    return { components: [row1, row2, row3, selectMenu] };
}

// 1. حدث دخول الصوت والإنشاء التلقائي واللوقات
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    const logChannelId = process.env.LOG_CHANNEL_ID;
    const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;

    // أ. إنشاء الروم عند دخول روم الإنشاء
    if (newState.channelId === process.env.JOIN_CHANNEL_ID) {
        const member = newState.member;

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
            await member.voice.setChannel(tempChannel);

            // 📜 لوق إنشاء الروم
            if (logChannel) {
                logChannel.send(`🟢 **تم إنشاء روم مؤقت:** <#${tempChannel.id}> بواسطة ${member}`);
            }

            const panel = await updateControlPanel(tempChannel, member.id);
            const controlMsg = await tempChannel.send({
                content: `<@${member.id}> أهلاً بك في رومك المؤقت، استخدم الأزرار والقائمة أدناه للتحكم:`,
                ...panel
            });

            tempChannel.controlMessageId = controlMsg.id;

            // تفعيل مؤقت كل 15 دقيقة لإرسال رسالة تذكير لصاحب الروم بالمنشن
            const interval = setInterval(async () => {
                try {
                    const currentChannel = guild.channels.cache.get(tempChannel.id);
                    if (!currentChannel || currentChannel.members.size === 0) {
                        clearInterval(interval);
                        roomIntervals.delete(tempChannel.id);
                        return;
                    }
                    await currentChannel.send(`⏰ تذكير: <@${member.id}> لا تنسى إدارة رومك الصوتي عبر الأزرار أدناه.`);
                } catch (e) {
                    clearInterval(interval);
                }
            }, 15 * 60 * 1000); // 15 دقيقة

            roomIntervals.set(tempChannel.id, interval);

        } catch (error) {
            console.error('خطأ أثناء إنشاء الروم:', error);
        }
    }

    // ب. حذف الروم تلقائياً عند خروج الجميع وتحديث القائمة
    if (oldState.channelId && tempChannels.has(oldState.channelId)) {
        const channel = oldState.guild.channels.cache.get(oldState.channelId);
        if (channel) {
            const ownerId = tempChannels.get(channel.id);
            if (channel.members.size === 0) {
                const channelName = channel.name;
                tempChannels.delete(channel.id);
                selectedUsers.delete(channel.id);
                
                if (roomIntervals.has(channel.id)) {
                    clearInterval(roomIntervals.get(channel.id));
                    roomIntervals.delete(channel.id);
                }

                await channel.delete().catch(() => {});

                if (logChannel) {
                    logChannel.send(`🔴 **تم حذف الروم المؤقت:** \`${channelName}\``);
                }
            } else if (channel.controlMessageId) {
                try {
                    const msg = await channel.messages.fetch(channel.controlMessageId);
                    const panel = await updateControlPanel(channel, ownerId);
                    await msg.edit(panel);
                } catch (e) {}
            }
        }
    }

    // تحديث القائمة عند دخول شخص جديد للروم
    if (newState.channelId && tempChannels.has(newState.channelId)) {
        const channel = newState.guild.channels.cache.get(newState.channelId);
        if (channel && channel.controlMessageId) {
            const ownerId = tempChannels.get(channel.id);
            try {
                const msg = await channel.messages.fetch(channel.controlMessageId);
                const panel = await updateControlPanel(channel, ownerId);
                await msg.edit(panel);
            } catch (e) {}
        }
    }

    // ج. لوق خروج أو طرد عضو من الروم الصوتي
    if (oldState.channelId && !newState.channelId) {
        if (logChannel) {
            logChannel.send(`🚪 **خروج/طرد:** خرج ${oldState.member} من الروم الصوتية \`${oldState.channel ? oldState.channel.name : 'صوتية'}\``);
        }
    }

    // د. لوق الميوت والدفن الإداري على مستوى السيرفر
    if (oldState.channelId && newState.channelId && oldState.channelId === newState.channelId) {
        if (logChannel) {
            if (!oldState.serverMute && newState.serverMute) {
                logChannel.send(`🔇 **Server Mute:** تم إعطاء ميوت سيرفر للمستخدم ${newState.member} في <#${newState.channelId}>`);
            } else if (oldState.serverMute && !newState.serverMute) {
                logChannel.send(`🔊 **فك Server Mute:** تم فك ميوت السيرفر عن ${newState.member} في <#${newState.channelId}>`);
            }

            if (!oldState.serverDeaf && newState.serverDeaf) {
                logChannel.send(`🎧 **Server Deafen:** تم إغلاق السماعة (Server Deaf) لـ ${newState.member} في <#${newState.channelId}>`);
            } else if (oldState.serverDeaf && !newState.serverDeaf) {
                logChannel.send(`🎧 **فك Server Deafen:** تم فتح السماعة لـ ${newState.member} في <#${newState.channelId}>`);
            }
        }
    }
});

// 2. التحكم بالأزرار والنوافذ التفاعلية
client.on('interactionCreate', async (interaction) => {
    const logChannelId = process.env.LOG_CHANNEL_ID;
    const logChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : null;
    const channel = interaction.channel;
    
    if (!channel || !tempChannels.has(channel.id)) return;
    const ownerId = tempChannels.get(channel.id);

    if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '❌ أنت لست صاحب هذا الروم!', ephemeral: true });
    }

    // التقاط العضو المختار من القائمة المنسدلة
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_target') {
        const targetId = interaction.values[0];
        selectedUsers.set(channel.id, targetId);
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
        const name = targetMember ? targetMember.displayName : targetId;
        return interaction.reply({ content: `✅ تم اختيار العضو: **${name}** (الآن اضغط على زر الأمر المطلوب مثل ميوت أو طرد)`, ephemeral: true });
    }

    if (interaction.isButton()) {
        switch (interaction.customId) {
            case 'btn_lock':
                await interaction.deferReply({ ephemeral: true });
                await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
                await interaction.editReply({ content: '🔒 تم قفل الروم.' });
                if (logChannel) logChannel.send(`🔒 **قفل الروم:** قام ${interaction.user} بقفل الروم <#${channel.id}>`);
                break;

            case 'btn_unlock':
                await interaction.deferReply({ ephemeral: true });
                await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
                await interaction.editReply({ content: '🔓 تم فتح الروم.' });
                if (logChannel) logChannel.send(`🔓 **فتح الروم:** قام ${interaction.user} بفتح الروم <#${channel.id}>`);
                break;

            case 'btn_hide':
                await interaction.deferReply({ ephemeral: true });
                await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
                await interaction.editReply({ content: '👻 تم إخفاء الروم.' });
                if (logChannel) logChannel.send(`👻 **إخفاء:** قام ${interaction.user} بإخفاء الروم <#${channel.id}>`);
                break;

            case 'btn_show':
                await interaction.deferReply({ ephemeral: true });
                await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
                await interaction.editReply({ content: '👁️ تم إظهار الروم.' });
                if (logChannel) logChannel.send(`👁️ **إظهار:** قام ${interaction.user} بإظهار الروم <#${channel.id}>`);
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

            case 'btn_allow': {
                await interaction.deferReply({ ephemeral: true });
                const targetId = selectedUsers.get(channel.id);
                if (!targetId || targetId === 'none') return interaction.editReply({ content: '❌ يرجى اختيار العضو من القائمة المنسدلة أولاً!' });

                await channel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true });
                await interaction.editReply({ content: `✅ تم السماح لـ <@${targetId}>.` });
                if (logChannel) logChannel.send(`✅ **سماح:** تم إعطاء صلاحية الدخول لـ <@${targetId}> في <#${channel.id}> بواسطة ${interaction.user}`);
                break;
            }

            case 'btn_deny': {
                await interaction.deferReply({ ephemeral: true });
                const targetId = selectedUsers.get(channel.id);
                if (!targetId || targetId === 'none') return interaction.editReply({ content: '❌ يرجى اختيار العضو من القائمة المنسدلة أولاً!' });

                await channel.permissionOverwrites.edit(targetId, { Connect: false });
                await interaction.editReply({ content: `🚫 تم منع <@${targetId}>.` });
                if (logChannel) logChannel.send(`🚫 **منع:** تم منع <@${targetId}> من دخول <#${channel.id}> بواسطة ${interaction.user}`);
                break;
            }

            case 'btn_kick': {
                await interaction.deferReply({ ephemeral: true });
                const targetId = selectedUsers.get(channel.id);
                if (!targetId || targetId === 'none') return interaction.editReply({ content: '❌ يرجى اختيار العضو من القائمة المنسدلة أولاً!' });

                const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
                if (targetMember && targetMember.voice.channelId === channel.id) {
                    await targetMember.voice.disconnect();
                    await interaction.editReply({ content: `🚫 تم طرد <@${targetId}>.` });
                    if (logChannel) logChannel.send(`🚫 **طرد عضو:** قام ${interaction.user} بطرد <@${targetId}> من <#${channel.id}>`);
                } else {
                    await interaction.editReply({ content: '❌ العضو غير موجود بالروم.' });
                }
                break;
            }

            case 'btn_mute': {
                await interaction.deferReply({ ephemeral: true });
                const targetId = selectedUsers.get(channel.id);
                if (!targetId || targetId === 'none') return interaction.editReply({ content: '❌ يرجى اختيار العضو من القائمة المنسدلة أولاً!' });

                const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
                if (targetMember && targetMember.voice.channelId === channel.id) {
                    await targetMember.voice.setMute(true);
                    await interaction.editReply({ content: `🔇 تم إعطاء Server Mute لـ <@${targetId}>.` });
                    if (logChannel) logChannel.send(`🔇 **Server Mute:** قام ${interaction.user} بإعطاء ميوت سيرفر لـ <@${targetId}> في <#${channel.id}>`);
                } else {
                    await interaction.editReply({ content: '❌ العضو غير موجود بالروم.' });
                }
                break;
            }

            case 'btn_unmute': {
                await interaction.deferReply({ ephemeral: true });
                const targetId = selectedUsers.get(channel.id);
                if (!targetId || targetId === 'none') return interaction.editReply({ content: '❌ يرجى اختيار العضو من القائمة المنسدلة أولاً!' });

                const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
                if (targetMember && targetMember.voice.channelId === channel.id) {
                    await targetMember.voice.setMute(false);
                    await interaction.editReply({ content: `🔊 تم فك Server Mute عن <@${targetId}>.` });
                    if (logChannel) logChannel.send(`🔊 **فك Server Mute:** قام ${interaction.user} بفك ميوت السيرفر عن <@${targetId}> في <#${channel.id}>`);
                } else {
                    await interaction.editReply({ content: '❌ العضو غير موجود بالروم.' });
                }
                break;
            }

            case 'btn_delete':
                await interaction.deferReply({ ephemeral: true });
                tempChannels.delete(channel.id);
                selectedUsers.delete(channel.id);
                
                if (roomIntervals.has(channel.id)) {
                    clearInterval(roomIntervals.get(channel.id));
                    roomIntervals.delete(channel.id);
                }

                await interaction.editReply({ content: '🗑️ جاري حذف الروم...' });
                if (logChannel) logChannel.send(`🗑️ **حذف يدوي:** قام ${interaction.user} بحذف الروم \`${channel.name}\``);
                await channel.delete().catch(() => {});
                break;
        }
    }

    if (interaction.isModalSubmit()) {
        await interaction.deferReply({ ephemeral: true });

        if (interaction.customId === 'modal_rename') {
            const newName = interaction.fields.getTextInputValue('new_name');
            await channel.setName(newName);
            await interaction.editReply({ content: `✅ تم تغيير اسم الروم إلى: **${newName}**` });
            if (logChannel) logChannel.send(`✏️ **تغيير اسم:** قام ${interaction.user} بتغيير اسم الروم إلى \`${newName}\``);
        }

        if (interaction.customId === 'modal_limit') {
            const limit = parseInt(interaction.fields.getTextInputValue('new_limit'));
            if (isNaN(limit) || limit < 0 || limit > 99) return interaction.editReply({ content: '❌ يرجى إدخال رقم صحيح.' });
            await channel.setUserLimit(limit);
            await interaction.editReply({ content: `✅ تم تغيير حد الأعضاء إلى: **${limit}**` });
            if (logChannel) logChannel.send(`🔢 **تحديد أعضاء:** قام ${interaction.user} بتحديد حد الأعضاء في <#${channel.id}> إلى \`${limit}\``);
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
