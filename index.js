const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const config = require('./config.json');

// ═══════════════════════════════════════════════════════════
// INISIALISASI CLIENT
// ═══════════════════════════════════════════════════════════

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ═══════════════════════════════════════════════════════════
// DATABASE SEDERHANA (JSON FILE)
// ═══════════════════════════════════════════════════════════

const DB_FILE = './database.json';

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading database:', e);
    }
    return { users: {}, keys: {}, stats: { totalKeys: 0, totalUsers: 0 } };
}

function saveDatabase(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving database:', e);
    }
}

// ═══════════════════════════════════════════════════════════
// WORK INK API HANDLER
// ═══════════════════════════════════════════════════════════

class WorkInkAPI {
    constructor() {
        this.apiKey = config.workink.apiKey;
        this.validationUrl = config.workink.validationUrl;
        this.keySystemUrl = config.workink.keySystemUrl;
    }

    // Generate link key dengan HWID
    generateKeyLink(hwid) {
        const params = new URLSearchParams({
            hwid: hwid,
            zone: 'Asia/Jakarta',
            ts: Date.now()
        });
        return `${this.keySystemUrl}?${params.toString()}`;
    }

    // Validasi key
    async validateKey(key, hwid) {
        try {
            // Method 1: GET request
            const response = await axios.get(this.validationUrl, {
                params: {
                    key: key,
                    hwid: hwid
                },
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'User-Agent': 'WorkInk-Bot/1.0'
                },
                timeout: 15000
            });

            return {
                success: true,
                valid: response.data.valid || response.data.success || false,
                data: response.data,
                message: response.data.message || 'Key valid!'
            };
        } catch (error) {
            // Jika GET gagal, coba POST
            try {
                const response = await axios.post(this.validationUrl, {
                    key: key,
                    hwid: hwid,
                    apiKey: this.apiKey
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'WorkInk-Bot/1.0'
                    },
                    timeout: 15000
                });

                return {
                    success: true,
                    valid: response.data.valid || response.data.success || false,
                    data: response.data,
                    message: response.data.message || 'Key valid!'
                };
            } catch (postError) {
                return {
                    success: false,
                    valid: false,
                    error: postError.response?.data?.message || postError.message
                };
            }
        }
    }
}

const workInk = new WorkInkAPI();

// ═══════════════════════════════════════════════════════════
// SLASH COMMANDS DEFINITION
// ═══════════════════════════════════════════════════════════

const commands = [
    new SlashCommandBuilder()
        .setName('getkey')
        .setDescription('🔑 Dapatkan link untuk mengambil key')
        .addStringOption(option =>
            option.setName('hwid')
                .setDescription('Hardware ID kamu (dari script)')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('checkkey')
        .setDescription('✅ Cek validitas key')
        .addStringOption(option =>
            option.setName('key')
                .setDescription('Key yang ingin dicek')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('hwid')
                .setDescription('HWID kamu')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('mykey')
        .setDescription('📋 Lihat info key kamu yang tersimpan'),

    new SlashCommandBuilder()
        .setName('keyinfo')
        .setDescription('ℹ️ Informasi tentang sistem key'),

    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('📊 [ADMIN] Statistik penggunaan bot')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('resetuser')
        .setDescription('🔄 [ADMIN] Reset data user')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User yang akan direset')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('broadcast')
        .setDescription('📢 [ADMIN] Kirim pesan ke semua user')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Pesan yang akan dikirim')
                .setRequired(true)
        )
];

// ═══════════════════════════════════════════════════════════
// BOT READY EVENT
// ═══════════════════════════════════════════════════════════

client.once('ready', async () => {
    console.log('');
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║                                           ║');
    console.log('║   🤖 WorkInk Key Bot - ONLINE!            ║');
    console.log('║                                           ║');
    console.log(`║   Bot: ${client.user.tag.padEnd(27)}     ║`);
    console.log(`║   Servers: ${client.guilds.cache.size.toString().padEnd(24)}     ║`);
    console.log('║                                           ║');
    console.log('╚═══════════════════════════════════════════╝');
    console.log('');

    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(config.token);

    try {
        console.log('🔄 Mendaftarkan slash commands...');

        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands.map(cmd => cmd.toJSON()) }
        );

        console.log('✅ Slash commands berhasil didaftarkan!');
        console.log('');
        console.log('📋 Commands yang tersedia:');
        commands.forEach(cmd => {
            console.log(`   /${cmd.name} - ${cmd.description}`);
        });
        console.log('');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }

    // Set bot activity
    client.user.setPresence({
        activities: [{ 
            name: '🔑 /getkey untuk ambil key', 
            type: 3 
        }],
        status: 'online'
    });

    // Update activity setiap 30 detik
    setInterval(() => {
        const activities = [
            { name: '🔑 /getkey untuk ambil key', type: 3 },
            { name: '✅ /checkkey untuk validasi', type: 3 },
            { name: `👥 ${Object.keys(loadDatabase().users).length} users`, type: 3 }
        ];
        const random = activities[Math.floor(Math.random() * activities.length)];
        client.user.setActivity(random.name, { type: random.type });
    }, 30000);
});

// ═══════════════════════════════════════════════════════════
// INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════

client.on('interactionCreate', async interaction => {
    
    // Handle Slash Commands
    if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction);
    }
    
    // Handle Button Interactions
    if (interaction.isButton()) {
        await handleButton(interaction);
    }
});

// ═══════════════════════════════════════════════════════════
// SLASH COMMAND HANDLER
// ═══════════════════════════════════════════════════════════

async function handleSlashCommand(interaction) {
    const { commandName } = interaction;
    const db = loadDatabase();

    // ─────────────────────────────────────────
    // /getkey - Dapatkan link key
    // ─────────────────────────────────────────
    if (commandName === 'getkey') {
        const hwid = interaction.options.getString('hwid');

        // Validasi HWID
        if (hwid.length < 5) {
            return interaction.reply({
                content: '❌ HWID terlalu pendek! Pastikan HWID valid dari script.',
                ephemeral: true
            });
        }

        // Generate link
        const keyLink = workInk.generateKeyLink(hwid);

        // Simpan ke database
        db.users[interaction.user.id] = {
            odiscordId: interaction.user.id,
            username: interaction.user.username,
            hwid: hwid,
            lastRequest: new Date().toISOString(),
            requestCount: (db.users[interaction.user.id]?.requestCount || 0) + 1
        };
        db.stats.totalUsers = Object.keys(db.users).length;
        saveDatabase(db);

        // Buat embed
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🔑 Key System - Work Ink')
            .setDescription('Klik tombol di bawah untuk mendapatkan key!')
            .addFields(
                { 
                    name: '📋 HWID Kamu', 
                    value: `\`\`\`${hwid}\`\`\``, 
                    inline: false 
                },
                { 
                    name: '⏰ Waktu Request', 
                    value: `<t:${Math.floor(Date.now() / 1000)}:F>`, 
                    inline: true 
                },
                {
                    name: '📊 Total Request',
                    value: `${db.users[interaction.user.id].requestCount}x`,
                    inline: true
                }
            )
            .addFields({
                name: '📝 Cara Mendapatkan Key',
                value: 
                    '```\n' +
                    '1️⃣ Klik tombol "Ambil Key" di bawah\n' +
                    '2️⃣ Selesaikan checkpoint (2-3 link)\n' +
                    '3️⃣ Copy key yang muncul di akhir\n' +
                    '4️⃣ Paste key ke script kamu\n' +
                    '```'
            })
            .setFooter({ 
                text: `Key berlaku 24 jam • ${interaction.user.username}`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        // Tombol
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('🔑 Ambil Key')
                    .setStyle(ButtonStyle.Link)
                    .setURL(keyLink),
                new ButtonBuilder()
                    .setCustomId('howto_key')
                    .setLabel('❓ Bantuan')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.reply({ 
            embeds: [embed], 
            components: [row],
            ephemeral: true 
        });

        console.log(`[GETKEY] ${interaction.user.username} requested key for HWID: ${hwid.substring(0, 10)}...`);
    }

    // ─────────────────────────────────────────
    // /checkkey - Validasi key
    // ─────────────────────────────────────────
    else if (commandName === 'checkkey') {
        const key = interaction.options.getString('key');
        const hwid = interaction.options.getString('hwid');

        await interaction.deferReply({ ephemeral: true });

        // Cek ke Work Ink API
        const result = await workInk.validateKey(key, hwid);

        if (result.success && result.valid) {
            // Key valid - simpan ke database
            db.keys[interaction.user.id] = {
                key: key,
                hwid: hwid,
                validatedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            };
            db.stats.totalKeys = (db.stats.totalKeys || 0) + 1;
            saveDatabase(db);

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Key Valid!')
                .setDescription('Key kamu berhasil divalidasi dan siap digunakan.')
                .addFields(
                    { 
                        name: '🔑 Key', 
                        value: `\`\`\`${key.substring(0, 20)}...\`\`\``, 
                        inline: false 
                    },
                    { 
                        name: '⏰ Berlaku Sampai', 
                        value: `<t:${Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000)}:F>`, 
                        inline: true 
                    },
                    {
                        name: '📋 HWID',
                        value: `\`${hwid.substring(0, 15)}...\``,
                        inline: true
                    }
                )
                .setFooter({ text: 'Selamat menggunakan!' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            console.log(`[CHECKKEY] ${interaction.user.username} - Key VALID`);
        } else {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Key Tidak Valid!')
                .setDescription('Key yang kamu masukkan tidak valid atau sudah expired.')
                .addFields(
                    { 
                        name: '❓ Kemungkinan Penyebab', 
                        value: 
                            '• Key sudah expired (lebih dari 24 jam)\n' +
                            '• Key salah ketik\n' +
                            '• HWID tidak cocok\n' +
                            '• Key sudah digunakan device lain'
                    },
                    {
                        name: '💡 Solusi',
                        value: 'Gunakan `/getkey` untuk mendapatkan key baru.'
                    }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            console.log(`[CHECKKEY] ${interaction.user.username} - Key INVALID`);
        }
    }

    // ─────────────────────────────────────────
    // /mykey - Lihat key tersimpan
    // ─────────────────────────────────────────
    else if (commandName === 'mykey') {
        const userData = db.users[interaction.user.id];
        const keyData = db.keys[interaction.user.id];

        if (!userData && !keyData) {
            return interaction.reply({
                content: '❌ Kamu belum pernah request key! Gunakan `/getkey` terlebih dahulu.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📋 Data Key Kamu')
            .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }));

        if (userData) {
            embed.addFields(
                { 
                    name: '📋 HWID Terakhir', 
                    value: `\`\`\`${userData.hwid}\`\`\``, 
                    inline: false 
                },
                { 
                    name: '🕐 Request Terakhir', 
                    value: `<t:${Math.floor(new Date(userData.lastRequest).getTime() / 1000)}:R>`, 
                    inline: true 
                },
                {
                    name: '📊 Total Request',
                    value: `${userData.requestCount || 1}x`,
                    inline: true
                }
            );
        }

        if (keyData) {
            const isExpired = new Date(keyData.expiresAt) < new Date();
            embed.addFields(
                { 
                    name: isExpired ? '🔑 Key (Expired)' : '🔑 Key Aktif', 
                    value: `\`\`\`${keyData.key.substring(0, 25)}...\`\`\``, 
                    inline: false 
                },
                {
                    name: '⏰ Status',
                    value: isExpired ? '❌ Expired' : `✅ Berlaku sampai <t:${Math.floor(new Date(keyData.expiresAt).getTime() / 1000)}:R>`,
                    inline: false
                }
            );
        }

        embed.setFooter({ text: 'WorkInk Key System' }).setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ─────────────────────────────────────────
    // /keyinfo - Info sistem key
    // ─────────────────────────────────────────
    else if (commandName === 'keyinfo') {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('ℹ️ Informasi Key System')
            .setDescription('Sistem key untuk mengakses script.')
            .addFields(
                { name: '⏰ Durasi Key', value: '24 jam', inline: true },
                { name: '🔄 Reset', value: 'Setiap 24 jam', inline: true },
                { name: '📋 HWID', value: 'Unik per device', inline: true }
            )
            .addFields({
                name: '📝 Cara Kerja',
                value:
                    '```\n' +
                    '1. Jalankan script → Muncul HWID\n' +
                    '2. Ketik /getkey <hwid> di Discord\n' +
                    '3. Klik link, selesaikan checkpoint\n' +
                    '4. Copy key, paste ke script\n' +
                    '5. Enjoy! Key berlaku 24 jam\n' +
                    '```'
            })
            .addFields({
                name: '❓ FAQ',
                value:
                    '**Q: Key tidak work?**\n' +
                    'A: Pastikan HWID cocok dan key belum expired.\n\n' +
                    '**Q: Bagaimana jika key expired?**\n' +
                    'A: Request key baru dengan `/getkey`'
            })
            .setFooter({ text: 'Work Ink Key System' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    // ─────────────────────────────────────────
    // /stats - Statistik (Admin Only)
    // ─────────────────────────────────────────
    else if (commandName === 'stats') {
        const totalUsers = Object.keys(db.users).length;
        const totalKeys = Object.keys(db.keys).length;
        
        // Hitung key aktif
        let activeKeys = 0;
        for (const userId in db.keys) {
            if (new Date(db.keys[userId].expiresAt) > new Date()) {
                activeKeys++;
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0xFFAA00)
            .setTitle('📊 Statistik Bot')
            .addFields(
                { name: '👥 Total Users', value: `${totalUsers}`, inline: true },
                { name: '🔑 Total Keys', value: `${totalKeys}`, inline: true },
                { name: '✅ Keys Aktif', value: `${activeKeys}`, inline: true },
                { name: '❌ Keys Expired', value: `${totalKeys - activeKeys}`, inline: true },
                { name: '🖥️ Server', value: `${client.guilds.cache.size}`, inline: true },
                { name: '📡 Ping', value: `${client.ws.ping}ms`, inline: true }
            )
            .setFooter({ text: 'Admin Statistics' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ─────────────────────────────────────────
    // /rese
