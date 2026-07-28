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

// تخزين ملكية الرومات الموقتة
const tempChannels = new Map();

client.on('ready', () => {
    console.log(`🤖 البوت متصل باسم: ${client.user.tag}`);
});

// 1. حدث دخول الصوت والإنشاء التلقائي
client.on('voiceStateUpdate', async (oldState, newState) => {
    // إذا دخل الشخص روم الإنشاء
    if (newState.channelId === process.env.JOIN_CHANNEL_ID) {
        const guild = newState.guild;
        const member = newState.member;

        try {
            // إنشاء الروم الموقت
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

            // حفظ صاحب الروم
            tempChannels.set(tempChannel.id, member.id);

            // نقل العضو للروم الجديد
            await member.voice.setChannel(tempChannel);

            // بناء الأزرار (طابق الصورة)
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

            // إرسال اللوحة داخل شات الروم الصوتي
            await tempChannel.send({
                content: `<@${member.id}>`,
                components: [row1, row2, row3]
            });

        } catch (error) {
            console.error('خطأ أثناء إنشاء الروم:', error);
        }
    }

    // 2. حذف الروم تلقائياً عند خروج الجميع
    if (oldState.channelId && tempChannels.has(oldState.channelId)) {
        const channel = oldState.guild.channels.cache.get(oldState.channelId);
        if (channel && channel.members.size === 0) {
            tempChannels.delete(channel.id);
            await channel.delete().catch(() => {});
        }
    }
});

// 3. التحكم بالأزرار والنوافذ التفاعلية
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        const channel = interaction.channel;
        const ownerId = tempChannels.get(channel.id);

        if (!ownerId) return;
        if (interaction.user.id !== ownerId) {
            return interaction.reply({ content: '❌ أنت لست صاحب هذا الروم!', ephemeral: true });
        }

        switch (interaction.customId) {
            case 'btn_lock':
                await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
                await interaction.reply({ content: '🔒 تم قفل الروم.', ephemeral: true });
                break;

            case 'btn_unlock':
                await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
                await interaction.reply({ content: '🔓 تم فتح الروم.', ephemeral: true });
                break;

            case 'btn_hide':
                await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
                await interaction.reply({ content: '👻 تم إخفاء الروم.', ephemeral: true });
                break;

            case 'btn_show':
                await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
                await interaction.reply({ content: '👁️ تم إظهار الروم.', ephemeral: true });
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

            case 'btn_kick': {
                const modal = new ModalBuilder().setCustomId('modal_kick').setTitle('طرد عضو من الروم');
                const input = new TextInputBuilder().setCustomId('target_user').setLabel('ID العضو').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);
                break;
            }

            case 'btn_allow': {
                const modal = new ModalBuilder().setCustomId('modal_allow').setTitle('إعطاء سماح لدخول عضو');
                const input = new TextInputBuilder().setCustomId('target_user').setLabel('ID العضو').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);
                break;
            }

            case 'btn_deny': {
                const modal = new ModalBuilder().setCustomId('modal_deny').setTitle('منع عضو من الدخول');
                const input = new TextInputBuilder().setCustomId('target_user').setLabel('ID العضو').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);
                break;
            }

            case 'btn_mute': {
                const modal = new ModalBuilder().setCustomId('modal_mute').setTitle('إعطاء ميوت لعضو');
                const input = new TextInputBuilder().setCustomId('target_user').setLabel('ID العضو').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);
                break;
            }

            case 'btn_unmute': {
                const modal = new ModalBuilder().setCustomId('modal_unmute').setTitle('فك الميوت عن عضو');
                const input = new TextInputBuilder().setCustomId('target_user').setLabel('ID العضو').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);
                break;
            }

            case 'btn_delete':
                tempChannels.delete(channel.id);
                await interaction.reply({ content: '🗑️ جاري حذف الروم...', ephemeral: true });
                await channel.delete().catch(() => {});
                break;
        }
    }

    if (interaction.isModalSubmit()) {
        const channel = interaction.channel;

        if (interaction.customId === 'modal_rename') {
            const newName = interaction.fields.getTextInputValue('new_name');
            await channel.setName(newName);
            await interaction.reply({ content: `✅ تم تغيير اسم الروم إلى: **${newName}**`, ephemeral: true });
        }

        if (interaction.customId === 'modal_limit') {
            const limit = parseInt(interaction.fields.getTextInputValue('new_limit'));
            if (isNaN(limit) || limit < 0 || limit > 99) return interaction.reply({ content: '❌ يرجى إدخال رقم صحيح.', ephemeral: true });
            await channel.setUserLimit(limit);
            await interaction.reply({ content: `✅ تم تغيير حد الأعضاء إلى: **${limit}**`, ephemeral: true });
        }

        if (interaction.customId === 'modal_kick') {
            const userId = interaction.fields.getTextInputValue('target_user');
            const targetMember = await interaction.guild.members.fetch(userId).catch(() => null);
            if (targetMember && targetMember.voice.channelId === channel.id) {
                await targetMember.voice.disconnect();
                await interaction.reply({ content: `🚫 تم طرد <@${userId}>.`, ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ العضو غير موجود بالروم.', ephemeral: true });
            }
        }

        if (interaction.customId === 'modal_allow') {
            const userId = interaction.fields.getTextInputValue('target_user');
            await channel.permissionOverwrites.edit(userId, { Connect: true, ViewChannel: true });
            await interaction.reply({ content: `✅ تم السماح لـ <@${userId}>.`, ephemeral: true });
        }

        if (interaction.customId === 'modal_deny') {
            const userId = interaction.fields.getTextInputValue('target_user');
            await channel.permissionOverwrites.edit(userId, { Connect: false });
            await interaction.reply({ content: `🚫 تم منع <@${userId}>.`, ephemeral: true });
        }

        if (interaction.customId === 'modal_mute') {
            const userId = interaction.fields.getTextInputValue('target_user');
            await channel.permissionOverwrites.edit(userId, { Speak: false });
            await interaction.reply({ content: `🔇 تم إعطاء ميوت لـ <@${userId}>.`, ephemeral: true });
        }

        if (interaction.customId === 'modal_unmute') {
            const userId = interaction.fields.getTextInputValue('target_user');
            await channel.permissionOverwrites.edit(userId, { Speak: true });
            await interaction.reply({ content: `🔊 تم فك الميوت عن <@${userId}>.`, ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);